import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { parseRollout } from "../src/codex.ts";
import { buildHistory, codexFrame } from "../src/history.ts";

const ID = "01a1559c-b0d2-7a91-b6c6-7bef0bff0857";
const line = (ts: string, type: string, payload: object) => JSON.stringify({ timestamp: ts, type, payload }) + "\n";
const MIN = 60_000;
const T0 = Date.parse("2026-10-24T08:00:00Z");

describe("Codex desde los rollouts", () => {
  it("% de contexto: entrada de la última petición sobre la ventana del modelo", () => {
    const r = parseRollout(
      line("2026-10-24T08:00:00Z", "session_meta", { id: ID, cwd: "/tmp/p" }) +
        line("2026-10-24T08:00:01Z", "event_msg", { type: "token_count", info: { total_token_usage: { input_tokens: 10 }, last_token_usage: { input_tokens: 95_000, total_tokens: 95_100 }, model_context_window: 475_000 } }),
      ID,
    )!;
    expect(r.contextPercent).toBe(20);
    const sin = parseRollout(line("2026-10-24T08:00:00Z", "session_meta", { id: ID }), ID)!;
    expect(sin.contextPercent).toBeUndefined();
  });

  it("turnos con inicio y fin; el último abierto queda en null", () => {
    const r = parseRollout(
      line("2026-10-24T08:00:00Z", "session_meta", { id: ID }) +
        line("2026-10-24T08:01:00Z", "event_msg", { type: "task_started" }) +
        line("2026-10-24T08:03:00Z", "event_msg", { type: "task_complete" }) +
        line("2026-10-24T08:10:00Z", "event_msg", { type: "task_started" }),
      ID,
    )!;
    expect(r.turns).toEqual([[T0 + MIN, T0 + 3 * MIN], [T0 + 10 * MIN, null]]);
  });

  it("estado en Rebobinar: trabajando si un turno toca el intervalo, luego para revisar y al final dormida", () => {
    const session = { id: ID, agent: "codex", title: "p", state: "dormida", floor: 0, lastEventAt: "" } as Session;
    const c = { sessions: new Map([[ID, session]]), turns: new Map([[ID, [[T0 + MIN, T0 + 2 * MIN]] as [number, number | null][]]]) };
    const at = (m: number) => codexFrame(c, T0 + m * MIN, 5 * MIN, 30 * MIN)[0]?.[1] ?? "-";
    expect([at(0), at(5), at(10), at(31), at(40)]).toEqual(["-", "trabajando", "para_revisar", "para_revisar", "dormida"]);
    // Un turno abierto sigue trabajando.
    const open = { ...c, turns: new Map([[ID, [[T0, null]] as [number, number | null][]]]) };
    expect(codexFrame(open, T0 + 60 * MIN, 5 * MIN, 30 * MIN)[0][1]).toBe("trabajando");
  });

  it("buildHistory mezcla Claude y Codex y marca el proveedor", () => {
    const session = { id: ID, agent: "codex", title: "Hilo", state: "dormida", floor: 3, lastEventAt: "" } as Session;
    const h = buildHistory([], T0, T0 + 10 * MIN, { stepMs: 5 * MIN, codex: { sessions: new Map([[ID, session]]), turns: new Map([[ID, [[T0 + MIN, T0 + 2 * MIN]]]]) } });
    expect(h.sessions[ID]).toMatchObject({ agent: "codex", title: "Hilo" });
    expect(h.frames[1].sessions).toEqual([[ID, "trabajando", new Date(T0 + 2 * MIN).toISOString()]]);
  });
});
