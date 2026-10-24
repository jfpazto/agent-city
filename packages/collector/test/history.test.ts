import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildHistory, localDayRange, readEvents, type LoggedEvent } from "../src/history.ts";

const T0 = Date.parse("2026-10-23T10:00:00Z");
const min = 60_000;
const ev = (offsetMin: number, hook_event_name: string, session_id = "s1"): LoggedEvent => ({
  at: T0 + offsetMin * min,
  event: { hook_event_name, session_id, cwd: "/tmp/proyecto-a" },
});

describe("buildHistory", () => {
  it("repite los eventos y saca un fotograma por paso con el estado de cada sesión", () => {
    const h = buildHistory([ev(1, "UserPromptSubmit"), ev(12, "Stop")], T0, T0 + 20 * min, { stepMs: 5 * min, idleMs: 60 * min });
    expect(h.frames.map((f) => f.sessions[0]?.[1] ?? "-")).toEqual(["-", "trabajando", "trabajando", "para_revisar", "para_revisar"]);
    expect(h.sessions.s1).toMatchObject({ id: "s1", title: "proyecto-a" });
  });

  it("un turno más corto que el paso sigue viéndose en su fotograma", () => {
    const h = buildHistory([ev(1, "UserPromptSubmit"), ev(2, "Stop")], T0, T0 + 10 * min, { stepMs: 5 * min, idleMs: 60 * min });
    expect(h.frames[1].sessions[0][1]).toBe("trabajando");
    expect(h.frames[2].sessions[0][1]).toBe("para_revisar");
  });

  it("aplica la inactividad, usa títulos conocidos y los eventos previos calientan el estado", () => {
    const h = buildHistory([ev(-10, "UserPromptSubmit"), ev(-9, "Stop")], T0, T0 + 40 * min, { stepMs: 10 * min, idleMs: 30 * min, titles: new Map([["s1", "Mi sesión"]]) });
    expect(h.frames[0].sessions[0][1]).toBe("para_revisar");
    expect(h.frames.at(-1)!.sessions[0][1]).toBe("dormida");
    expect(h.sessions.s1.title).toBe("Mi sesión");
  });
});

describe("readEvents y localDayRange", () => {
  it("lee solo Claude dentro del rango e ignora líneas rotas", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-history-"));
    try {
      const line = (at: string, agent = "claude") => JSON.stringify({ receivedAt: at, agent, event: { hook_event_name: "Stop", session_id: "x" } });
      await writeFile(path.join(dir, "2026-10-23.jsonl"), [line("2026-10-23T09:00:00Z"), "{roto", line("2026-10-23T11:00:00Z", "codex"), line("2026-10-23T12:00:00Z")].join("\n") + "\n");
      const out = await readEvents(dir, Date.parse("2026-10-23T08:00:00Z"), Date.parse("2026-10-23T11:30:00Z"));
      expect(out.map((e) => new Date(e.at).toISOString())).toEqual(["2026-10-23T09:00:00.000Z"]);
      expect(await readEvents(path.join(dir, "no-existe"), 0, 1)).toEqual([]);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("valida el día", () => {
    expect(localDayRange("2026-13-99x")).toBeUndefined();
    const r = localDayRange("2026-10-23")!;
    expect(r.to - r.from).toBeGreaterThanOrEqual(23 * 3_600_000);
  });
});
