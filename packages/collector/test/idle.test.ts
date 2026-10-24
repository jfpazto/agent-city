import { afterEach, describe, expect, it, vi } from "vitest";
import { createSessionStore, expire, reduce, type HookEvent, type SessionStore } from "../src/sessions.ts";
import { createServer, idleMsFromEnv } from "../src/server.ts";

const T0 = new Date("2026-10-19T10:00:00Z");
const at = (ms: number) => new Date(T0.getTime() + ms);
const MIN = 60 * 1000;
const ev = (hook_event_name: string, extra: Partial<HookEvent> = {}): HookEvent => ({
  session_id: "s1",
  hook_event_name,
  cwd: "/tmp/proyecto",
  ...extra,
});

function storeWith(events: HookEvent[], idleMs?: number) {
  const store = createSessionStore({ idleMs });
  const msgs: unknown[] = [];
  for (const e of events) store.apply(e, T0);
  store.subscribe((m) => msgs.push(m));
  return { store, msgs };
}

describe("expire (puro)", () => {
  const working = reduce(undefined, ev("UserPromptSubmit"), T0)!;

  it("duerme a los 30 min y no antes", () => {
    expect(expire(working, at(30 * MIN - 1000))).toBeUndefined();
    const s = expire(working, at(30 * MIN))!;
    expect(s.state).toBe("dormida");
    expect(s.lastEventAt).toBe(working.lastEventAt);
    expect(working.state).toBe("trabajando");
  });

  it("te_necesita no cambia por el paso del tiempo, salvo 48 h sin eventos", () => {
    const red = reduce(working, ev("PermissionRequest", { tool_name: "Bash" }), T0)!;
    expect(expire(red, at(24 * 60 * MIN))).toBeUndefined();
    // Sin ningún evento en 48 h, el rojo es de una sesión cerrada sin SessionEnd.
    const stale = expire(red, at(48 * 60 * MIN))!;
    expect(stale.state).toBe("dormida");
    expect(stale.pending).toEqual([]);
  });

  it("para_revisar se duerme; dormida no se toca", () => {
    const stop = reduce(working, ev("Stop"), T0)!;
    expect(expire(stop, at(30 * MIN))?.state).toBe("dormida");
    expect(expire(expire(stop, at(30 * MIN))!, at(60 * MIN))).toBeUndefined();
  });
});

describe("store.tick", () => {
  it("duerme y avisa solo cuando cambia", () => {
    const { store, msgs } = storeWith([ev("UserPromptSubmit")]);
    store.tick(at(29 * MIN));
    expect(msgs).toHaveLength(0);
    store.tick(at(30 * MIN));
    expect(store.get("s1")?.state).toBe("dormida");
    expect(msgs).toEqual([{ type: "session", session: expect.objectContaining({ state: "dormida" }) }]);
    store.tick(at(90 * MIN));
    expect(msgs).toHaveLength(1);
  });

  it("te_necesita sigue en rojo tras 2 h", () => {
    const { store, msgs } = storeWith([ev("UserPromptSubmit"), ev("PermissionRequest", { tool_name: "Bash" })]);
    store.tick(at(120 * MIN));
    expect(store.get("s1")?.state).toBe("te_necesita");
    expect(msgs).toHaveLength(0);
  });

  it("respeta el tiempo configurado", () => {
    const { store } = storeWith([ev("UserPromptSubmit")], 5 * MIN);
    store.tick(at(5 * MIN));
    expect(store.get("s1")?.state).toBe("dormida");
  });

  it("un evento nuevo reinicia el reloj y despierta la sesión", () => {
    const { store } = storeWith([ev("UserPromptSubmit")]);
    store.tick(at(30 * MIN));
    store.apply(ev("UserPromptSubmit"), at(31 * MIN));
    expect(store.get("s1")?.state).toBe("trabajando");
    store.tick(at(60 * MIN));
    expect(store.get("s1")?.state).toBe("trabajando");
    store.tick(at(61 * MIN));
    expect(store.get("s1")?.state).toBe("dormida");
  });
});

describe("servidor", () => {
  afterEach(() => vi.useRealTimers());

  it("revisa la inactividad con su intervalo y lo para al cerrar", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
    const tick = vi.fn();
    const store = { ...createSessionStore(), tick } as SessionStore;
    const server = createServer({ store, ws: false, eventsDir: "/nonexistent", tickMs: 1000 });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);
    await new Promise<void>((r) => server.close(() => r()));
    vi.advanceTimersByTime(3000);
    expect(tick).toHaveBeenCalledTimes(3);
  });

  it("lee CIUDAD_IDLE_MINUTES y vuelve a 30 min si no es válido", () => {
    expect(idleMsFromEnv("5")).toBe(5 * MIN);
    expect(idleMsFromEnv("0.05")).toBe(3000);
    expect(idleMsFromEnv(undefined)).toBe(30 * MIN);
    expect(idleMsFromEnv("abc")).toBe(30 * MIN);
    expect(idleMsFromEnv("-1")).toBe(30 * MIN);
  });
});
