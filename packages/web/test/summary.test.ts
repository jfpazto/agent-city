import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { formatTokens, summarize } from "../src/hud/summary.ts";

const s = (state: Session["state"], tokens?: Session["tokens"]): Session => ({
  id: Math.random().toString(),
  title: "t",
  state,
  floor: 0,
  lastEventAt: "2026-10-19T10:00:00Z",
  tokens,
});

describe("summarize", () => {
  it("cuenta por estado y suma todos los tokens", () => {
    const r = summarize([
      s("trabajando", { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 }),
      s("trabajando"),
      s("te_necesita", { input: 10, output: 0, cacheRead: 0, cacheCreation: 0 }),
      s("dormida"),
    ]);
    expect(r.counts).toEqual({ trabajando: 2, te_necesita: 1, para_revisar: 0, dormida: 1 });
    expect(r.tokens).toBe(20);
  });

  it("torre vacía: todo a cero", () => {
    expect(summarize([])).toEqual({ counts: { trabajando: 0, te_necesita: 0, para_revisar: 0, dormida: 0 }, tokens: 0 });
  });
});

describe("formatTokens", () => {
  it("unidades con coma decimal", () => {
    expect(formatTokens(0)).toBe("0");
    expect(formatTokens(950)).toBe("950");
    expect(formatTokens(12_345)).toBe("12,3 k");
    expect(formatTokens(7_556_865)).toBe("7,56 M");
    expect(formatTokens(2_100_000_000)).toBe("2,10 G");
  });

  it("en los límites cambia de unidad en vez de mostrar 1000", () => {
    expect(formatTokens(999.6)).toBe("1,0 k");
    expect(formatTokens(999_950)).toBe("1,00 M");
    expect(formatTokens(999_995_000)).toBe("1,00 G");
  });
});
