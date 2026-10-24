import { describe, expect, it } from "vitest";
import type { AgentProvider, Session } from "@ciudad/shared";
import { addRelation, buildingAt, buildingKey, emptySlots, groupBuildings, layoutWorld, PENNANT_COLORS, pennantColors, pointOnPath, recencySlots, registerSlots, type Slots, type WorldLayout } from "../src/world/model.ts";
import { clampMap, fitMap, mapPoint, zoomMap } from "../src/world/camera.ts";
import { CITY_STORAGE_KEY, loadPreferences, savePreferences } from "../src/world/preferences.ts";
import { matchSessions } from "../src/hud/search.ts";

const s = (id: string, project: string, agent?: AgentProvider, state: Session["state"] = "trabajando"): Session => ({
  id, title: `Sesión ${id}`, agent, floor: Number(id.replace(/\D/g, "")) || 0, state, lastEventAt: "2026-10-19T10:00:00Z",
  project: { id: project, name: project === "a" ? "Proyecto Álamo" : "Otro proyecto", root: `/demo/${project}` },
});
const sessions = [s("s0", "a"), s("s1", "a", "codex"), s("s2", "b", "claude", "te_necesita"), s("s3", "a", "claude", "para_revisar")];
function worldOf(input = sessions, previous: Slots = emptySlots(), relations: Parameters<typeof layoutWorld>[2] = []) {
  const groups = groupBuildings(input), slots = registerSlots(groups, previous);
  return { world: layoutWorld(groups, slots, relations), slots };
}

describe("barrios y solares", () => {
  it("un proyecto en ambos proveedores tiene dos edificios; una sesión antigua sigue siendo Claude", () => {
    const { world } = worldOf();
    expect(world.buildings).toHaveLength(3);
    expect(world.buildings.find((b) => b.id === buildingKey("claude", "a"))?.sessions.map((s) => s.id)).toEqual(["s0", "s3"]);
    expect(world.buildings.find((b) => b.id === buildingKey("codex", "a"))?.sessions.map((s) => s.id)).toEqual(["s1"]);
    expect(world.districts.map((d) => [d.provider, d.count, d.sessions])).toEqual([["claude", 2, 3], ["codex", 1, 1]]);
    expect(matchSessions(sessions, "codex")).toEqual(["s1"]);
  });

  it("repositorios homónimos son solares distintos y llevan un rótulo distinto", () => {
    const { world } = worldOf([s("1", "b"), s("2", "c")]);
    const [a, b] = world.buildings;
    expect(a.project.name).toBe(b.project.name);
    expect(a.id).not.toBe(b.id);
    expect(a.label).not.toBe(b.label);
    expect(a.x).not.toBe(b.x);
  });

  it("cerrar edificios, añadir proyectos o ampliar filas no mueve los solares existentes", () => {
    const { world, slots } = worldOf();
    const added = Array.from({ length: 12 }, (_, i) => s(`new${i}`, `new-${i}`));
    const next = worldOf([sessions[2], ...added], slots);
    const before = world.buildings.find((b) => b.project.id === "b")!;
    const after = next.world.buildings.find((b) => b.project.id === "b")!;
    expect([after.x, after.y]).toEqual([before.x, before.y]);
    expect(next.world.rows).toBeGreaterThan(world.rows);
    expect(next.slots.claude[0]).toBe(slots.claude[0]);
    const reopened = worldOf(sessions, next.slots).world.buildings.find((b) => b.id === buildingKey("claude", "a"))!;
    expect([reopened.x, reopened.y]).toEqual([world.buildings[0].x, world.buildings[0].y]);
  });

  it("ordena cada barrio del proyecto trabajado más recientemente al más antiguo", () => {
    const at = (x: Session, lastEventAt: string): Session => ({ ...x, lastEventAt });
    const input = [at(s("s0", "a"), "2026-10-19T09:00:00Z"), at(s("s1", "b"), "2026-10-19T08:00:00Z"), at(s("s2", "b"), "2026-10-19T11:00:00Z"),
      at(s("s3", "c"), "2026-10-19T10:00:00Z"), at(s("s4", "a", "codex"), "2026-10-19T07:00:00Z")];
    const groups = groupBuildings(input);
    expect(recencySlots(groups)).toEqual({ claude: ["b", "c", "a"], codex: ["a"] });
    const world = layoutWorld(groups, recencySlots(groups));
    expect(world.buildings.find((b) => b.id === buildingKey("claude", "b"))!.slot).toBe(0);
    expect(world.buildings.find((b) => b.id === buildingKey("claude", "a"))!.slot).toBe(2);
  });

  it("vacío conserva dos barrios vacíos, sin inventar sesiones ni edificios", () => {
    const { world } = worldOf([]);
    expect(world.buildings).toEqual([]);
    expect(world.bridges).toEqual([]);
    expect(world.districts.every((d) => !d.count && !d.sessions)).toBe(true);
    expect(buildingAt(world, { x: 10, y: 10 })).toBeUndefined();
  });
});

describe("puentes que representan relaciones", () => {
  it("solo comparte automáticamente el mismo id de proyecto entre Claude y Codex", () => {
    const { world } = worldOf();
    expect(world.bridges).toHaveLength(1);
    expect(world.bridges[0]).toMatchObject({ kind: "same-project", from: buildingKey("claude", "a"), to: buildingKey("codex", "a"), active: true });
    const homonyms = worldOf([s("1", "b"), s("2", "c", "codex")]).world;
    expect(homonyms.bridges).toEqual([]);
  });

  it("relaciones manuales son simétricas y sin duplicados ni autoenlaces", () => {
    const a = addRelation([], "a", "b");
    expect(addRelation(a, "b", "a")).toBe(a);
    expect(addRelation(a, "a", "a")).toBe(a);
    const { world } = worldOf(sessions, emptySlots(), a);
    expect(world.bridges.filter((b) => b.kind === "manual")).toHaveLength(1);
    expect(world.bridges.filter((b) => b.kind === "same-project")).toHaveLength(1);
    expect(world.bridges.every((b) => b.points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y)))).toBe(true);
  });

  it("al faltar un extremo no deja puentes colgantes; reaparece si el proyecto vuelve", () => {
    const r = [{ from: "a", to: "b" }];
    expect(worldOf([sessions[0]], emptySlots(), r).world.bridges).toEqual([]);
    expect(worldOf(sessions, emptySlots(), r).world.bridges.some((b) => b.kind === "manual")).toBe(true);
    expect(worldOf([s("1", "a", "claude", "dormida"), s("2", "a", "codex", "dormida")]).world.bridges[0].active).toBe(false);
  });

  it("conecta dentro de cada proveedor común o entre barrios si no comparten proveedor", () => {
    const r = [{ from: "a", to: "b" }];
    const both = [s("1", "a"), s("2", "a", "codex"), s("3", "b"), s("4", "b", "codex")];
    expect(worldOf(both, emptySlots(), r).world.bridges.filter((b) => b.kind === "manual")).toHaveLength(2);
    expect(worldOf([s("1", "a"), s("2", "b", "codex")], emptySlots(), r).world.bridges).toHaveLength(1);
  });

  it("el recorrido respeta distancias y esquinas, incluso con segmentos de longitud cero", () => {
    const points = [{ x: 0, y: 0 }, { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }];
    expect(pointOnPath(points, 0.25)).toEqual({ x: 50, y: 0 });
    expect(pointOnPath(points, 0.75)).toEqual({ x: 100, y: 50 });
    expect(pointOnPath(points, 1)).toEqual({ x: 100, y: 100 });
  });
});

describe("cámara del mapa", () => {
  const viewport = { x: 0, y: 138, w: 1000, h: 620 };
  it("ajusta toda la ciudad debajo de los controles y detecta el mismo edificio con zoom y desplazamiento", () => {
    const { world } = worldOf();
    const camera = fitMap(world.bounds, viewport);
    expect(camera.x).toBeGreaterThanOrEqual(viewport.x);
    expect(camera.y).toBeGreaterThanOrEqual(viewport.y);
    expect(camera.x + world.bounds.w * camera.zoom).toBeLessThanOrEqual(viewport.w);
    const b = world.buildings[0];
    const screen = { x: camera.x + camera.zoom * (b.x + b.w / 2), y: camera.y + camera.zoom * (b.y + b.h / 2) };
    expect(buildingAt(world, mapPoint(camera, screen))?.id).toBe(b.id);
    expect(mapPoint(zoomMap(camera, 1.4, screen), screen).x).toBeCloseTo(b.x + b.w / 2);
  });

  it("acota ambos ejes sin perder la ciudad; conserva una cámara guardada al volver de un edificio", () => {
    const { world } = worldOf();
    const near = { x: -400, y: -200, zoom: 1.5 };
    expect(clampMap(near, world.bounds, viewport)).toEqual(near);
    expect(clampMap({ x: 1e9, y: 1e9, zoom: 1 }, world.bounds, viewport).x).toBeLessThanOrEqual(24);
    const far = clampMap({ x: -1e9, y: -1e9, zoom: 2 }, world.bounds, viewport);
    expect(far.x + world.bounds.w * far.zoom).toBeGreaterThanOrEqual(viewport.w - 24);
    expect(far.y + world.bounds.h * far.zoom).toBeGreaterThanOrEqual(viewport.y + viewport.h - 24);
  });
});

describe("persistencia local de relaciones y solares", () => {
  it("conserva preferencias tras recargar y evita vínculos duplicados, corruptos o consigo mismo", () => {
    let serialized = "";
    const storage = { setItem: (key: string, value: string) => { expect(key).toBe(CITY_STORAGE_KEY); serialized = value; }, getItem: () => serialized };
    const preferences = { slots: { claude: ["a", "b"], codex: ["a"] }, relations: [{ from: "a", to: "b" }], motion: false, sound: true };
    expect(savePreferences(preferences, storage)).toBe(true);
    expect(loadPreferences(storage)).toEqual(preferences);
    const raw = JSON.parse(serialized);
    raw.relations.push({ from: "b", to: "a" }, { from: "a", to: "a" }, { from: 42, to: "b" });
    raw.slots.claude.push("a", null);
    serialized = JSON.stringify(raw);
    expect(loadPreferences(storage)).toEqual(preferences);
  });

  it("un navegador sin almacenamiento o con JSON corrupto conserva la app operativa", () => {
    const blocked = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("quota"); } };
    expect(loadPreferences(blocked)).toEqual({ slots: emptySlots(), relations: [], motion: true, sound: false });
    expect(loadPreferences({ getItem: () => "{broken" }).relations).toEqual([]);
    expect(savePreferences(loadPreferences(), blocked)).toBe(false);
    expect(savePreferences(loadPreferences())).toBe(false);
  });
});

describe("pennantColors", () => {
  it("un color por grupo de edificios vinculados y ninguno para los sueltos", () => {
    const world = {
      buildings: [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }, { id: "e" }],
      bridges: [{ from: "a", to: "b" }, { from: "b", to: "c" }, { from: "d", to: "e" }],
    } as unknown as WorldLayout;
    const colors = pennantColors(world);
    expect(colors.get("a")).toBe(PENNANT_COLORS[0]);
    expect(colors.get("c")).toBe(PENNANT_COLORS[0]);
    expect(colors.get("d")).toBe(PENNANT_COLORS[1]);
    expect(colors.get("e")).toBe(PENNANT_COLORS[1]);
    expect(pennantColors({ buildings: [{ id: "x" }], bridges: [] } as unknown as WorldLayout).size).toBe(0);
  });
});
