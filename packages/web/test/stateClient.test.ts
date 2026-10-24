import { describe, expect, it, vi } from "vitest";
import type { Session } from "@ciudad/shared";
import { applyMessage } from "../src/stateClient.ts";

const s = (id: string, floor: number, state: Session["state"] = "dormida"): Session => ({
  id,
  title: id,
  state,
  floor,
  lastEventAt: "2026-10-19T10:00:00Z",
});

describe("applyMessage", () => {
  it("aplica snapshot, session y removed", () => {
    const m = new Map<string, Session>();
    expect(applyMessage(m, JSON.stringify({ type: "snapshot", sessions: [s("A", 0), s("B", 1)] }))).toBe("snapshot");
    expect(applyMessage(m, JSON.stringify({ type: "session", session: s("A", 0, "te_necesita") }))).toBe("session");
    expect(applyMessage(m, JSON.stringify({ type: "removed", id: "B" }))).toBe("removed");
    expect([...m.values()].map((x) => [x.id, x.state])).toEqual([["A", "te_necesita"]]);
  });

  it("descarta mensajes malformados o desconocidos sin lanzar ni tocar el estado", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const m = new Map([["A", s("A", 0)]]);
    expect(applyMessage(m, "{no json")).toBe(false);
    expect(applyMessage(m, "null")).toBe(false);
    expect(applyMessage(m, JSON.stringify({ type: "otro" }))).toBe(false);
    expect([...m.keys()]).toEqual(["A"]);
    warn.mockRestore();
  });
});

describe("applyMessage con límites de uso", () => {
  const limits = (provider: "claude" | "codex", used: number) => ({ provider, observedAt: "2026-10-21T10:00:00Z", fiveHour: { usedPercent: used, resetsAt: "2026-10-21T12:00:00Z", windowMinutes: 300 } });

  it("el snapshot reemplaza los límites y un mensaje usage actualiza solo su proveedor", () => {
    const m = new Map(), usage = new Map();
    expect(applyMessage(m, JSON.stringify({ type: "snapshot", sessions: [], usage: [limits("claude", 10), limits("codex", 20)] }), usage)).toBe("snapshot");
    expect(applyMessage(m, JSON.stringify({ type: "usage", limits: limits("codex", 90) }), usage)).toBe("usage");
    expect(usage.get("claude").fiveHour.usedPercent).toBe(10);
    expect(usage.get("codex").fiveHour.usedPercent).toBe(90);
    expect(applyMessage(m, JSON.stringify({ type: "snapshot", sessions: [] }), usage)).toBe("snapshot");
    expect(usage.size).toBe(0);
  });

  it("un usage sin límites se descarta", () => {
    expect(applyMessage(new Map(), JSON.stringify({ type: "usage" }), new Map())).toBe(false);
  });
});
