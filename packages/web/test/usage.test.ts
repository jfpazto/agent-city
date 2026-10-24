import { describe, expect, it } from "vitest";
import type { UsageLimits } from "@ciudad/shared";
import { facilityRect, resetLabel, usageShortText, usageSummary, usageView } from "../src/world/usage.ts";

const NOW = new Date(2026, 9, 21, 12, 0); // miércoles 21 oct, 12:00 local
const at = (h: number) => new Date(NOW.getTime() + h * 3_600_000).toISOString();
const limits = (five: number, week: number, observedHoursAgo = 0, fiveReset = 2, weekReset = 50): UsageLimits => ({
  provider: "codex",
  observedAt: at(-observedHoursAgo),
  fiveHour: { usedPercent: five, resetsAt: at(fiveReset), windowMinutes: 300 },
  weekly: { usedPercent: week, resetsAt: at(weekReset), windowMinutes: 10080 },
});

describe("usageView", () => {
  it("el nivel es lo que queda y marca bajo y agotado", () => {
    expect(usageView("codex", limits(68, 30), NOW).fiveHour).toMatchObject({ state: "ok", remaining: 32 });
    expect(usageView("codex", limits(94, 30), NOW).fiveHour).toMatchObject({ state: "bajo", remaining: 6 });
    expect(usageView("codex", limits(100, 30), NOW).fiveHour).toMatchObject({ state: "agotado", remaining: 0 });
    expect(usageView("codex", limits(68, 30), NOW).weekly).toMatchObject({ state: "ok", remaining: 70 });
  });

  it("pasada la recarga se muestra lleno, nunca la cifra caducada", () => {
    const v = usageView("codex", limits(99, 99, 3, -1, -0.5), NOW);
    expect(v.fiveHour).toEqual({ state: "recargado", remaining: 100 });
    expect(v.weekly).toEqual({ state: "recargado", remaining: 100 });
  });

  it("sin dato o con un dato demasiado antiguo no hay porcentaje", () => {
    expect(usageView("claude", undefined, NOW).fiveHour).toEqual({ state: "sin_dato", remaining: null });
    // Observado hace 7 h con una recarga aún futura (reloj raro): no se enseña.
    expect(usageView("codex", limits(50, 50, 7, 1), NOW).fiveHour).toEqual({ state: "sin_dato", remaining: null });
    expect(usageView("codex", { provider: "codex", observedAt: at(0) }, NOW).weekly.state).toBe("sin_dato");
  });
});

describe("textos", () => {
  it("hora de recarga: hoy con hora y otro día con el día de la semana", () => {
    expect(resetLabel(new Date(2026, 9, 21, 18, 40), NOW)).toBe("18:40");
    expect(resetLabel(new Date(2026, 9, 23, 9, 5), NOW)).toBe("vie 09:05");
  });

  it("rótulo corto de lejos y de cerca, y frase completa", () => {
    const v = usageView("codex", limits(68, 30), NOW);
    expect(usageShortText(v, NOW, true)).toBe("32 %");
    expect(usageShortText(v, NOW, false)).toBe("32 % · 14:00");
    expect(usageSummary(v, NOW)).toBe("Límite de Codex · 5 h: quedan 32 %, recarga 14:00 · semana: quedan 70 %, recarga vie 14:00");
    const none = usageView("claude", undefined, NOW);
    expect(usageShortText(none, NOW, false)).toBe("sin dato");
    expect(usageSummary(none, NOW)).toBe("Límite de Claude · 5 h: sin dato reciente · semana: sin dato reciente");
  });
});

it("el depósito cabe en la franja de rótulo y no invade los solares", () => {
  const r = facilityRect({ provider: "claude", x: 32, y: 32, w: 844, h: 700, count: 1, sessions: 1 });
  expect(r.y + r.h).toBeLessThanOrEqual(32 + 64);
  expect(r.x + r.w).toBeLessThanOrEqual(32 + 844);
});
