import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { layoutCity } from "../src/tower/city.ts";
import { centerOn, clampCamera, scrollBy, worldBounds } from "../src/tower/camera.ts";
import { sessionAt } from "../src/panel/model.ts";
import { matchSessions } from "../src/hud/search.ts";

const vp = { width: 1000, height: 700 };
const s = (id: string, project: string, floor: number, projectFloor: number): Session => ({
  id, floor, projectFloor, title: `Sesión ${id}`, state: "trabajando", lastEventAt: "2026-10-19T10:00:00Z",
  project: { id: project, name: `Proyecto ${project}`, root: `/demo/${project}` },
});
const sessions = [s("a1", "a", 0, 0), s("b1", "b", 1, 0), s("a2", "a", 2, 1)];

describe("ciudad de proyectos/agentes", () => {
  it("agrupa en dos edificios y apila una sesión por piso sobre el mismo suelo", () => {
    const l = layoutCity(sessions, vp);
    expect(l.buildings.map((b) => b.project.id)).toEqual(["a", "b"]);
    const [a1, a2, b1] = ["a1", "a2", "b1"].map((id) => l.cells.find((c) => c.kind === "session" && c.id === id)!);
    expect(a1.x).toBe(a2.x);
    expect(a1.y).toBe(b1.y);
    expect(a2.y).toBeLessThan(a1.y);
    expect(b1.x).toBeGreaterThan(a1.x + a1.w);
    expect(l.buildings.every((b) => b.y + b.h === l.groundY)).toBe(true);
  });

  it("la baja no deja huecos: los pisos bajan y solo queda en venta el de arriba; el edificio no se mueve", () => {
    const before = layoutCity(sessions, vp, ["a", "b"]);
    const after = layoutCity(sessions.filter((s) => s.id !== "a1"), vp, ["a", "b"]);
    const a = after.cells.filter((c) => c.x === before.cells.find((b) => b.kind === "session" && b.id === "a2")!.x);
    expect(a.map((c) => c.kind === "session" ? c.id : c.kind)).toEqual(["a2", "for_sale"]);
    const gap = [{ ...sessions[0], id: "x0", projectFloor: 0 }, { ...sessions[0], id: "x3", projectFloor: 3 }];
    const kinds = layoutCity(gap, vp).cells.map((c) => c.kind === "session" ? c.id : c.kind);
    expect(kinds).toEqual(["x0", "x3", "for_sale"]);
    const onlyB = layoutCity([sessions[1]], vp, ["a", "b"]);
    expect(onlyB.buildings).toHaveLength(1);
    expect(onlyB.buildings[0].x).toBe(before.buildings[1].x);
  });

  it("sin sesiones no hay edificios inventados; soporta colector anterior y nombres iguales", () => {
    expect(layoutCity([], vp).buildings).toEqual([]);
    const old: Session[] = [
      { id: "old", title: "old", floor: 12, state: "dormida", lastEventAt: "", cwd: "/demo/web" },
      { id: "old2", title: "old2", floor: 20, state: "dormida", lastEventAt: "", cwd: "/otro/web" },
    ];
    const l = layoutCity(old, vp);
    expect(l.buildings).toHaveLength(2);
    expect(l.buildings[0].label).not.toBe(l.buildings[1].label);
    expect(l.cells.filter((c) => c.kind === "session").map((c) => c.floor)).toEqual([0, 0]);
  });

  it("una recarga conserva el orden de los edificios al desaparecer su primera sesión", () => {
    const withOrder = sessions.map((s) => ({ ...s, project: { ...s.project!, order: s.project!.id === "a" ? 0 : 1 } }));
    const before = layoutCity(withOrder, vp);
    // Snapshot ordenado por floor global: B llega antes que la sesión superviviente de A.
    const reloaded = layoutCity(withOrder.slice(1), vp);
    for (const building of before.buildings) {
      expect(reloaded.buildings.find((b) => b.project.id === building.project.id)?.x).toBe(building.x);
    }
  });

  it("buscar un proyecto encuentra sus sesiones y permite centrar y abrir la de otro edificio con zoom", () => {
    const many = Array.from({ length: 8 }, (_, i) => s(`s${i}`, `${i}`, i, 0));
    const l = layoutCity(many, vp);
    expect(matchSessions(many, "proyecto 7")).toEqual(["s7"]);
    const cell = l.cells.find((c) => c.kind === "session" && c.id === "s7")!;
    const bounds = worldBounds(l.tower.y, vp, l.worldWidth);
    const cam = clampCamera(centerOn({ x: 0, y: 0, zoom: 1.5 }, cell, vp), bounds, vp);
    const x = cam.x + cam.zoom * (cell.x + cell.w / 2);
    const y = cam.y + cam.zoom * (cell.y + cell.h / 2);
    expect(x).toBeGreaterThanOrEqual(0);
    expect(x).toBeLessThan(vp.width);
    expect(y).toBeLessThan(vp.height);
    expect(sessionAt(l, cam, x, y)).toBe("s7");
    const right = clampCamera(scrollBy({ x: 0, y: 0, zoom: 1 }, 0, 1e6), bounds, vp);
    expect(right.x).toBe(vp.width - l.worldWidth);
    expect(clampCamera(scrollBy(right, 0, -1e6), bounds, vp).x).toBeCloseTo(0);
  });

  it("dentro del edificio, la sesión más reciente va arriba y la más antigua abajo", () => {
    const base = { title: "x", floor: 0, state: "dormida" as const, cwd: "/demo/orden" };
    const list: Session[] = [
      { ...base, id: "media", projectFloor: 0, lastEventAt: "2026-10-21T10:00:00Z" },
      { ...base, id: "nueva", projectFloor: 1, lastEventAt: "2026-10-21T12:00:00Z" },
      { ...base, id: "vieja", projectFloor: 2, lastEventAt: "2026-10-20T09:00:00Z" },
    ];
    const kinds = layoutCity(list, vp).cells.map((c) => c.kind === "session" ? c.id : c.kind);
    expect(kinds).toEqual(["vieja", "media", "nueva", "for_sale"]);
  });
});
