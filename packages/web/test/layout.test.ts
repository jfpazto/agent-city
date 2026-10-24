import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { FLOOR_H, FRAME, GROUND_H, initials, layoutTower, truncate } from "../src/tower/layout.ts";

const s = (floor: number, title = `s${floor}`): Session => ({
  id: `id-${floor}`,
  title,
  state: "dormida",
  floor,
  lastEventAt: "2026-10-19T10:00:00Z",
});
const vp = { width: 1200, height: 800 };

describe("layoutTower", () => {
  it("tres sesiones: abajo izquierda, abajo derecha y segunda fila izquierda", () => {
    const l = layoutTower([s(0), s(1), s(2)], vp);
    expect(l.cells).toHaveLength(8);
    expect(l.cells.filter((c) => c.kind === "session")).toHaveLength(3);
    const [c0, c1, c2] = l.cells;
    expect(c0.y).toBe(c1.y);
    expect(c0.x).toBeLessThan(c1.x);
    expect(c2.x).toBe(c0.x);
    expect(c2.y).toBe(c0.y - (FLOOR_H + FRAME));
    expect(c0.y + FLOOR_H + FRAME).toBe(l.groundY);
  });

  it("huecos: las plantas libres quedan EN VENTA", () => {
    const l = layoutTower([s(0), s(5)], vp);
    expect(l.cells).toHaveLength(8);
    expect(l.cells.slice(1, 5).every((c) => c.kind === "for_sale")).toBe(true);
    expect(l.cells[5]).toMatchObject({ kind: "session", floor: 5, x: l.cells[1].x, y: l.cells[4].y });
  });

  it("muchas sesiones: planta 13 → 8 filas", () => {
    expect(layoutTower([s(13)], vp).cells).toHaveLength(16);
  });

  it("torre vacía: 4 filas EN VENTA", () => {
    const l = layoutTower([], vp);
    expect(l.cells).toHaveLength(8);
    expect(l.cells.every((c) => c.kind === "for_sale")).toBe(true);
  });

  it("centrada y con el suelo en el borde inferior", () => {
    const l = layoutTower([], vp);
    expect(l.groundY).toBe(vp.height - GROUND_H);
    expect(l.tower.x * 2 + l.tower.w).toBeGreaterThanOrEqual(vp.width - 1);
    expect(l.tower.y + l.tower.h).toBe(l.groundY);
  });
});

describe("initials y truncate", () => {
  it.each([
    ["FrontAgentico", "FR"],
    ["agente linkedin", "AL"],
    ["kodo-agents", "KA"],
    ["mi_proyecto", "MP"],
    ["123", "??"],
  ])("%s → %s", (t, i) => expect(initials(t)).toBe(i));

  it("recorta a 18 con «…»", () => {
    const r = truncate("a".repeat(30));
    expect([...r]).toHaveLength(18);
    expect(r.endsWith("…")).toBe(true);
    expect(truncate("corto")).toBe("corto");
  });
});
