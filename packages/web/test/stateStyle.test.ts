import { describe, expect, it } from "vitest";
import type { SessionState } from "@ciudad/shared";
import { BLINK_PERIOD_MS, blinkAlpha, glowAlpha, iconPixels, ICONS, STATE_STYLE } from "../src/tower/layout.ts";

const states: SessionState[] = ["trabajando", "te_necesita", "para_revisar", "dormida"];

describe("STATE_STYLE", () => {
  it("usa los tokens de DESIGN.md", () => {
    expect(STATE_STYLE.trabajando.color).toBe("#3DDC84");
    expect(STATE_STYLE.te_necesita.color).toBe("#E5484D");
    expect(STATE_STYLE.para_revisar.color).toBe("#F5C542");
    expect(STATE_STYLE.dormida.color).toBe("#4A5068");
  });

  it("cada estado tiene etiqueta e icono propios", () => {
    expect(new Set(states.map((s) => STATE_STYLE[s].label)).size).toBe(4);
    expect(new Set(states.map((s) => STATE_STYLE[s].icon)).size).toBe(4);
  });

  it("solo te_necesita parpadea", () => {
    expect(states.filter((s) => STATE_STYLE[s].blink)).toEqual(["te_necesita"]);
  });
});

describe("parpadeo", () => {
  it("blinkAlpha queda entre 0,35 y 0,85 y varía", () => {
    const vals = Array.from({ length: 64 }, (_, i) => blinkAlpha((i * BLINK_PERIOD_MS) / 64));
    expect(Math.min(...vals)).toBeGreaterThanOrEqual(0.35 - 1e-9);
    expect(Math.max(...vals)).toBeLessThanOrEqual(0.85 + 1e-9);
    expect(Math.max(...vals) - Math.min(...vals)).toBeGreaterThan(0.4);
  });

  it("glowAlpha: fijo salvo te_necesita; dormida opaco", () => {
    expect(glowAlpha("trabajando", 0)).toBe(glowAlpha("trabajando", 400));
    expect(glowAlpha("dormida", 123)).toBe(1);
    expect(glowAlpha("te_necesita", 0)).not.toBe(glowAlpha("te_necesita", 400));
  });
});

describe("iconos", () => {
  it("son 7×7 y tienen píxeles encendidos", () => {
    for (const icon of Object.values(ICONS)) {
      expect(icon).toHaveLength(7);
      expect(icon.every((r) => /^[01]{7}$/.test(r))).toBe(true);
      expect(iconPixels(icon).length).toBeGreaterThan(5);
    }
  });
});
