import { describe, expect, it } from "vitest";
import { createSessionStore, reduce, type HookEvent, type InternalSession } from "../src/sessions.ts";

const now = new Date("2026-10-19T10:00:00Z");
const ev = (hook_event_name: string, extra: Partial<HookEvent> = {}): HookEvent => ({
  hook_event_name,
  session_id: "sesion-a-1234",
  cwd: "/tmp/proyecto-a",
  transcript_path: "/tmp/a.jsonl",
  ...extra,
});

function run(events: HookEvent[]) {
  let s: InternalSession | undefined;
  const states: string[] = [];
  for (const e of events) {
    const next = reduce(s, e, now);
    if (next) s = next;
    states.push(s?.state ?? "-");
  }
  return { s, states };
}

describe("reduce", () => {
  it("ciclo completo con permiso", () => {
    const { states } = run([
      ev("SessionStart"),
      ev("UserPromptSubmit"),
      ev("PreToolUse", { tool_name: "Bash" }),
      ev("PermissionRequest", { tool_name: "Bash" }),
      ev("PostToolUse", { tool_name: "Bash" }),
      ev("Stop"),
    ]);
    expect(states).toEqual(["dormida", "trabajando", "trabajando", "te_necesita", "trabajando", "para_revisar"]);
  });

  it("ignora el aviso de permiso que llega tarde", () => {
    const { s } = run([
      ev("PreToolUse", { tool_name: "Bash", tool_use_id: "u1" }),
      ev("PermissionRequest", { tool_name: "Bash" }),
      ev("PostToolUse", { tool_name: "Bash", tool_use_id: "u1" }),
      ev("Notification", { notification_type: "permission_prompt", message: "permiso" }),
    ]);
    expect(s!.state).toBe("trabajando");
  });

  it("el aviso de permiso mantiene el rojo si sigue pendiente", () => {
    const { s } = run([
      ev("PermissionRequest", { tool_name: "Bash" }),
      ev("Notification", { notification_type: "permission_prompt", message: "Claude needs your permission" }),
    ]);
    expect(s!.state).toBe("te_necesita");
    expect(s!.lastMessage).toBe("Claude needs your permission");
  });

  it("herramientas en paralelo no apagan un permiso pendiente (caso real)", () => {
    const { states } = run([
      ev("PreToolUse", { tool_name: "Bash", tool_use_id: "u-bash" }),
      ev("PermissionRequest", { tool_name: "Bash" }),
      ev("PreToolUse", { tool_name: "update_plan", tool_use_id: "u-plan" }),
      ev("PostToolUse", { tool_name: "update_plan", tool_use_id: "u-plan" }),
      ev("Notification", { notification_type: "permission_prompt" }),
      ev("PostToolUse", { tool_name: "Bash", tool_use_id: "u-bash" }),
    ]);
    expect(states).toEqual(["trabajando", "te_necesita", "te_necesita", "te_necesita", "te_necesita", "trabajando"]);
  });

  it("permiso sin PreToolUse previo se resuelve por nombre de herramienta", () => {
    const { states } = run([
      ev("PermissionRequest", { tool_name: "Write" }),
      ev("PostToolUse", { tool_name: "Read", tool_use_id: "r1" }),
      ev("PostToolUse", { tool_name: "Write", tool_use_id: "w1" }),
    ]);
    expect(states).toEqual(["te_necesita", "te_necesita", "trabajando"]);
  });

  it("PostToolUseFailure resuelve el permiso como PostToolUse", () => {
    const { states } = run([
      ev("PreToolUse", { tool_name: "Bash", tool_use_id: "u1" }),
      ev("PermissionRequest", { tool_name: "Bash" }),
      ev("PostToolUseFailure", { tool_name: "Bash", tool_use_id: "u1" }),
    ]);
    expect(states).toEqual(["trabajando", "te_necesita", "trabajando"]);
  });

  it("permiso denegado: una llamada nueva de la misma herramienta resuelve el pendiente", () => {
    const { states } = run([
      ev("PreToolUse", { tool_name: "Bash", tool_use_id: "u1" }),
      ev("PermissionRequest", { tool_name: "Bash" }),
      ev("PreToolUse", { tool_name: "Read", tool_use_id: "r1" }),
      ev("PostToolUse", { tool_name: "Read", tool_use_id: "r1" }),
      ev("PreToolUse", { tool_name: "Bash", tool_use_id: "u2" }),
      ev("PostToolUse", { tool_name: "Bash", tool_use_id: "u2" }),
      ev("Stop"),
    ]);
    expect(states).toEqual(["trabajando", "te_necesita", "te_necesita", "te_necesita", "trabajando", "trabajando", "para_revisar"]);
  });

  it("aviso de permiso sin PermissionRequest previo no cambia el estado", () => {
    const { s } = run([ev("UserPromptSubmit"), ev("Notification", { notification_type: "permission_prompt" })]);
    expect(s!.state).toBe("trabajando");
  });

  it("aviso de otro tipo tras Stop se queda en para_revisar y guarda el mensaje", () => {
    const { s } = run([ev("Stop"), ev("Notification", { notification_type: "idle_prompt", message: "esperando" })]);
    expect(s!.state).toBe("para_revisar");
    expect(s!.lastMessage).toBe("esperando");
  });

  it("título: session_title si viene; si no, carpeta", () => {
    expect(run([ev("SessionStart")]).s!.title).toBe("proyecto-a");
    expect(run([ev("UserPromptSubmit", { session_title: "Mi sesión" })]).s!.title).toBe("Mi sesión");
    expect(reduce(undefined, { hook_event_name: "Stop", session_id: "abcdefghijk" }, now)!.title).toBe("abcdefgh");
  });

  it("ignora eventos sin session_id o desconocidos y retira en SessionEnd", () => {
    expect(reduce(undefined, { hook_event_name: "Stop" }, now)).toBeUndefined();
    expect(reduce(undefined, { hook_event_name: "Stop", session_id: 42 as unknown as string }, now)).toBeUndefined();
    const s = reduce(undefined, ev("SessionStart"), now)!;
    expect(reduce(s, ev("Raro"), now)).toBeUndefined();
    expect(reduce(s, ev("SessionEnd"), now)).toBeNull();
    expect(reduce(s, ev("SubagentStop"), now)!.state).toBe("dormida");
  });
});

describe("subagentes", () => {
  it("cuenta los activos por agent_id y los cierra con SubagentStop", () => {
    let s = reduce(undefined, ev("UserPromptSubmit"), now)!;
    s = reduce(s, ev("PreToolUse", { tool_name: "Read", tool_use_id: "t1", agent_id: "a1", agent_type: "Explore" }), now)!;
    s = reduce(s, ev("PreToolUse", { tool_name: "Read", tool_use_id: "t2", agent_id: "a2", agent_type: "Explore" }), now)!;
    s = reduce(s, ev("PostToolUse", { tool_name: "Read", tool_use_id: "t1", agent_id: "a1" }), now)!;
    expect(s.subagentsActive).toBe(2);
    s = reduce(s, ev("SubagentStop", { agent_id: "a1" }), now)!;
    expect(s.subagentsActive).toBe(1);
    expect(s.state).toBe("trabajando");
    // Los eventos de la madre (sin agent_id) no los tocan.
    s = reduce(s, ev("PreToolUse", { tool_name: "Bash", tool_use_id: "t3" }), now)!;
    expect(s.subagentsActive).toBe(1);
  });

  it("al dormirse ya no hay subagentes trabajando y no se exponen sus ids", () => {
    const store = createSessionStore({ idleMs: 1000 });
    store.apply(ev("PreToolUse", { tool_name: "Read", agent_id: "a1" }), now);
    expect(store.get("sesion-a-1234")!.subagentsActive).toBe(1);
    expect("activeAgents" in store.get("sesion-a-1234")!).toBe(false);
    store.tick(new Date(now.getTime() + 2000));
    expect(store.get("sesion-a-1234")!.subagentsActive).toBe(0);
  });
});

describe("contexto y avería en el store", () => {
  it("setContext redondea, limita a 0-100 y solo avisa si cambia", () => {
    const store = createSessionStore();
    store.apply(ev("SessionStart"), now);
    const seen: number[] = [];
    store.subscribe((m) => m.type === "session" && seen.push(m.session.contextPercent!));
    store.setContext("sesion-a-1234", 71.6);
    store.setContext("sesion-a-1234", 72.2);
    store.setContext("sesion-a-1234", 140);
    store.setContext("no-existe", 50);
    expect(seen).toEqual([72, 100]);
  });

  it("una respuesta buena borra la avería anterior", () => {
    const store = createSessionStore();
    store.apply(ev("SessionStart"), now);
    store.setMetrics("sesion-a-1234", { failure: { kind: "rate_limit", at: now.toISOString() } });
    expect(store.get("sesion-a-1234")!.failure?.kind).toBe("rate_limit");
    store.setMetrics("sesion-a-1234", { failure: undefined });
    expect(store.get("sesion-a-1234")!.failure).toBeUndefined();
  });
});

describe("createSessionStore", () => {
  it("asigna plantas y reutiliza las libres", () => {
    const store = createSessionStore();
    store.apply(ev("SessionStart", { session_id: "A" }), now);
    store.apply(ev("SessionStart", { session_id: "B" }), now);
    store.apply(ev("SessionEnd", { session_id: "A" }), now);
    store.apply(ev("SessionStart", { session_id: "C" }), now);
    expect(store.list().map((s) => [s.id, s.floor])).toEqual([["C", 0], ["B", 1]]);
    expect(store.get("A")).toBeUndefined();
    expect(store.get("C")).not.toHaveProperty("pending");
  });

  it("subscribe avisa solo de cambios reales", () => {
    const store = createSessionStore();
    const msgs: string[] = [];
    const off = store.subscribe((m) => msgs.push(m.type === "removed" ? `removed:${m.id}` : `session:${m.session.state}`));
    store.apply(ev("SessionStart", { session_id: "S" }), now);
    store.apply({ hook_event_name: "Stop" }, now); // sin session_id: ignorado
    store.apply(ev("Raro", { session_id: "S" }), now); // tipo desconocido: ignorado
    store.apply(ev("PermissionRequest", { session_id: "S", tool_name: "Bash" }), now);
    store.apply(ev("SessionEnd", { session_id: "S" }), now);
    off();
    store.apply(ev("SessionStart", { session_id: "T" }), now);
    expect(msgs).toEqual(["session:dormida", "session:te_necesita", "removed:S"]);
  });

  it("un listener que falla no rompe apply ni a los demás", () => {
    const store = createSessionStore();
    let seen = 0;
    store.subscribe(() => { throw new Error("boom"); });
    store.subscribe(() => seen++);
    expect(() => store.apply(ev("SessionStart", { session_id: "S" }), now)).not.toThrow();
    expect(seen).toBe(1);
  });
});
