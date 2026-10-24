import { describe, expect, it } from "vitest";
import { layoutScenery, wrapX } from "../src/tower/scenery.ts";

describe("layoutScenery", () => {
  it("es determinista", () => {
    expect(layoutScenery(1000, 600, [{ x: 400, w: 248 }])).toEqual(layoutScenery(1000, 600, [{ x: 400, w: 248 }]));
  });

  it("cubre todo el ancho con skyline y deja libres los edificios", () => {
    const building = { x: 400, w: 248 };
    const sc = layoutScenery(1000, 600, [building]);
    const last = sc.skyline[sc.skyline.length - 1];
    expect(last.x + last.w).toBeGreaterThanOrEqual(1000);
    for (const x of [...sc.trees, ...sc.lamps, ...sc.benches]) expect(x + 34 < building.x || x > building.x + building.w + 28).toBe(true);
    expect(sc.trees.length + sc.lamps.length + sc.benches.length).toBeGreaterThan(0);
    expect(sc.walkers.length).toBeGreaterThanOrEqual(3);
  });
});

describe("wrapX", () => {
  it("vuelve a entrar por el otro borde", () => {
    expect(wrapX(0, 0, 0, 500)).toBe(0);
    expect(wrapX(560, 10, 0, 500)).toBe(-20);
    expect(wrapX(-60, 0, 0, 500)).toBe(520);
  });
});
