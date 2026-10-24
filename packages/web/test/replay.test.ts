import { describe, expect, it } from "vitest";
import type { HistoryResponse } from "@ciudad/shared";
import { firstBusyFrame, frameSessions, frameTime, replayDays } from "../src/world/replay.ts";

const h: HistoryResponse = {
  from: "2026-10-23T08:00:00Z",
  to: "2026-10-23T08:10:00Z",
  stepMs: 300_000,
  sessions: { a: { id: "a", title: "Uno", floor: 0 } },
  frames: [
    { at: "2026-10-23T08:00:00Z", sessions: [] },
    { at: "2026-10-23T08:05:00Z", sessions: [["a", "trabajando", "2026-10-23T08:04:00Z"], ["fantasma", "dormida", "x"]] },
  ],
};

describe("replay", () => {
  it("convierte un fotograma en sesiones de Claude e ignora ids desconocidos", () => {
    expect(frameSessions(h, 1)).toEqual([{ id: "a", title: "Uno", floor: 0, agent: "claude", state: "trabajando", lastEventAt: "2026-10-23T08:04:00Z" }]);
    expect(frameSessions(h, 99)).toHaveLength(1);
    expect(frameSessions(h, 0)).toEqual([]);
  });
  it("primer fotograma con actividad, hora local y días disponibles", () => {
    expect(firstBusyFrame(h)).toBe(1);
    expect(frameTime("2026-10-23T08:05:00")).toBe("08:05");
    expect(replayDays(new Date(2026, 9, 2), 3)).toEqual(["2026-10-02", "2026-10-01", "2026-09-30"]);
  });
});
