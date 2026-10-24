import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { DEFAULT_PRICES, estimateCost, estimateSessionCost, loadPrices, priceFor, type PriceTable } from "../src/pricing.ts";

const fixed: PriceTable = { "claude-x": { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75, cacheWrite1h: 6 } };
const tokens = { input: 1_000_000, output: 200_000, cacheRead: 2_000_000, cacheCreation: 400_000 };

describe("estimateCost", () => {
  it("precios fijos y tokens conocidos", () => {
    // 3 + 0,2·15 + 2·0,3 + 0,4·3,75 = 3 + 3 + 0,6 + 1,5
    expect(estimateCost(tokens, "claude-x", fixed)).toBeCloseTo(8.1, 10);
  });

  it("modelo desconocido o ausente: undefined", () => {
    expect(estimateCost(tokens, "otro", fixed)).toBeUndefined();
    expect(estimateCost(tokens, undefined, fixed)).toBeUndefined();
  });

  it("ids con fecha usan su modelo; un modelo nuevo no hereda precio", () => {
    expect(priceFor("claude-x-20260101", fixed)).toBe(fixed["claude-x"]);
    expect(priceFor("claude-opus-5-5-20261001", DEFAULT_PRICES)).toBe(DEFAULT_PRICES["claude-opus-5-5"]);
    expect(priceFor("claude-opus-5-20261001", DEFAULT_PRICES)).toBe(DEFAULT_PRICES["claude-opus-5"]);
    expect(priceFor("claude-opus-5-7", DEFAULT_PRICES)).toBeUndefined();
    expect(priceFor("claude-sonnet-5-8", DEFAULT_PRICES)).toBeUndefined();
  });

  it("la escritura de caché de 1 h se cobra a su precio", () => {
    // 400 000 escritos, 100 000 de ellos con 1 h: 0,3·3,75 + 0,1·6 = 1,125 + 0,6
    const t = { input: 0, output: 0, cacheRead: 0, cacheCreation: 400_000, cacheCreation1h: 100_000 };
    expect(estimateCost(t, "claude-x", fixed)).toBeCloseTo(1.725, 10);
  });
});

describe("estimateSessionCost", () => {
  it("suma cada modelo a su precio; sin precio para un modelo usado → undefined", () => {
    const t2: PriceTable = { ...fixed, "claude-y": { input: 1, output: 1, cacheRead: 1, cacheWrite: 1, cacheWrite1h: 1 } };
    const one = { input: 1_000_000, output: 0, cacheRead: 0, cacheCreation: 0 };
    expect(estimateSessionCost({ "claude-x": one, "claude-y": one }, t2)).toBeCloseTo(4, 10);
    expect(estimateSessionCost({ "claude-x": one, otro: one }, t2)).toBeUndefined();
    expect(estimateSessionCost({ "claude-x": one, otro: { ...one, input: 0 } }, t2)).toBeCloseTo(3, 10);
  });
});

describe("DEFAULT_PRICES", () => {
  it("Opus 5.5: 4 / 20, lectura 0,20, escritura 5", () => {
    expect(DEFAULT_PRICES["claude-opus-5-5"]).toEqual({ input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5, cacheWrite1h: 8 });
  });
});

describe("loadPrices", () => {
  it("mezcla el archivo sobre la tabla por defecto e ignora entradas inválidas", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-pr-"));
    const file = path.join(dir, "precios.json");
    const { cacheWrite1h: _omit, ...sin1h } = fixed["claude-x"];
    await fs.writeFile(file, JSON.stringify({ "claude-x": fixed["claude-x"], "claude-z": sin1h, malo: { input: -1 } }));
    const t = loadPrices(file);
    expect(t["claude-x"]).toEqual(fixed["claude-x"]);
    expect(t["claude-z"].cacheWrite1h).toBe(6); // 2 × entrada por defecto
    expect(t.malo).toBeUndefined();
    expect(t["claude-opus-5-5"]).toEqual(DEFAULT_PRICES["claude-opus-5-5"]);
    expect(loadPrices(path.join(dir, "no-existe.json"))).toBe(DEFAULT_PRICES);
    await fs.rm(dir, { recursive: true, force: true });
  });
});
