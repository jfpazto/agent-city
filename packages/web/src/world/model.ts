import type { AgentProvider, Project, Session, SessionState } from "@ciudad/shared";
import { sessionProject } from "../tower/city.ts";

export type Rect = { x: number; y: number; w: number; h: number };
export type Point = { x: number; y: number };
export type Slots = Record<AgentProvider, string[]>;
export type Relation = { from: string; to: string };
export type BuildingGroup = { id: string; provider: AgentProvider; project: Project; sessions: Session[] };
export type MapBuilding = BuildingGroup & Rect & { slot: number; lot: Rect; state: SessionState; label: string };
export type District = Rect & { provider: AgentProvider; count: number; sessions: number };
export type Bridge = { id: string; from: string; to: string; kind: "same-project" | "manual"; points: Point[]; active: boolean };
export type WorldLayout = { buildings: MapBuilding[]; districts: District[]; bridges: Bridge[]; bounds: Rect; columns: number; rows: number };

export const LOT_W = 236;
export const LOT_H = 216;
export const ROAD = 40;
export const ROOF_DEPTH = 14;
const BORDER = 28;
const HEADER = 70;
export const providerOf = (s: Session): AgentProvider => s.agent === "codex" ? "codex" : "claude";
export const buildingKey = (provider: AgentProvider, project: string): string => JSON.stringify([provider, project]);
export const emptySlots = (): Slots => ({ claude: [], codex: [] });

/** No se mezclan sesiones de distintos proveedores ni clones homónimos. */
export function groupBuildings(sessions: Session[]): BuildingGroup[] {
  const groups = new Map<string, BuildingGroup>();
  for (const s of sessions) {
    const project = sessionProject(s), provider = providerOf(s), id = buildingKey(provider, project.id);
    let group = groups.get(id);
    if (!group) groups.set(id, group = { id, provider, project, sessions: [] });
    group.sessions.push(s);
  }
  return [...groups.values()].map((g) => ({ ...g, sessions: g.sessions.sort((a, b) =>
    (a.projectFloor ?? a.floor) - (b.projectFloor ?? b.floor) || a.id.localeCompare(b.id)) }))
    .sort((a, b) => a.provider.localeCompare(b.provider) || (a.project.order ?? 0) - (b.project.order ?? 0) || a.project.id.localeCompare(b.project.id));
}

/** Conserva solares incluso cuando desaparece su último piso; no modifica el registro recibido. */
export function registerSlots(groups: BuildingGroup[], previous: Slots): Slots {
  const slots: Slots = { claude: [...previous.claude], codex: [...previous.codex] };
  for (const group of groups) {
    if (!slots[group.provider].includes(group.project.id)) slots[group.provider].push(group.project.id);
  }
  return slots;
}

/** Última actividad de un edificio: el evento más reciente de cualquiera de sus sesiones (ms). */
export function lastActivity(group: BuildingGroup): number {
  return Math.max(0, ...group.sessions.map((s) => Date.parse(s.lastEventAt) || 0));
}

/** Solares por actividad: en cada barrio, primero el proyecto trabajado más recientemente. */
export function recencySlots(groups: BuildingGroup[]): Slots {
  const slots = emptySlots();
  const ordered = [...groups].sort((a, b) => lastActivity(b) - lastActivity(a) || a.project.id.localeCompare(b.project.id));
  for (const g of ordered) if (!slots[g.provider].includes(g.project.id)) slots[g.provider].push(g.project.id);
  return slots;
}

export function buildingState(sessions: Session[]): SessionState {
  for (const state of ["te_necesita", "trabajando", "para_revisar", "dormida"] as const) {
    if (sessions.some((s) => s.state === state)) return state;
  }
  return "dormida";
}

/** Mapa determinista: las manzanas se amplían hacia abajo y cada edificio ocupa el solar que indica `slots`. */
export function layoutWorld(groups: BuildingGroup[], slots: Slots, relations: Relation[] = []): WorldLayout {
  const columns = 3;
  const rows = Math.max(2, Math.ceil(Math.max(slots.claude.length, slots.codex.length) / columns));
  const w = BORDER * 2 + columns * LOT_W + (columns - 1) * ROAD;
  const h = HEADER + BORDER + rows * LOT_H + (rows - 1) * ROAD;
  const gap = 84;
  const districts: District[] = (["claude", "codex"] as const).map((provider, i) => ({
    provider, x: 32 + i * (w + gap), y: 32, w, h,
    count: groups.filter((g) => g.provider === provider).length,
    sessions: groups.filter((g) => g.provider === provider).reduce((n, g) => n + g.sessions.length, 0),
  }));
  const buildings = groups.map((g): MapBuilding => {
    const district = districts.find((d) => d.provider === g.provider)!;
    const slot = Math.max(0, slots[g.provider].indexOf(g.project.id));
    const lot = { x: district.x + BORDER + slot % columns * (LOT_W + ROAD), y: district.y + HEADER + Math.floor(slot / columns) * (LOT_H + ROAD), w: LOT_W, h: LOT_H };
    const homonym = groups.some((other) => other.id !== g.id && other.provider === g.provider && other.project.name === g.project.name);
    return { ...g, slot, lot, x: lot.x + 38, y: lot.y + 30, w: 126, h: 104, state: buildingState(g.sessions), label: homonym ? `${g.project.name} · ${slot + 1}` : g.project.name };
  });
  const bounds = { x: 0, y: 0, w: 64 + 2 * w + gap, h: 64 + h + 46 };
  const world: WorldLayout = { buildings, districts, bounds, bridges: [], columns, rows };
  world.bridges = connectBridges(world, relations);
  return world;
}

export const relationKey = (a: string, b: string): string => JSON.stringify([a, b].sort());
export function addRelation(current: Relation[], from: string, to: string): Relation[] {
  if (!from || !to || from === to || current.some((r) => relationKey(r.from, r.to) === relationKey(from, to))) return current;
  return [...current, { from, to }];
}

/** Solo se relacionan el mismo proyecto entre proveedores o vínculos explícitos del usuario. */
function connectBridges(world: WorldLayout, relations: Relation[]): Bridge[] {
  const pairs: Array<{ a: MapBuilding; b: MapBuilding; kind: Bridge["kind"] }> = [];
  const seen = new Set<string>();
  const add = (a: MapBuilding, b: MapBuilding, kind: Bridge["kind"]) => {
    const id = relationKey(a.id, b.id);
    if (a.id === b.id || seen.has(id)) return;
    seen.add(id);
    pairs.push({ a, b, kind });
  };
  for (const a of world.buildings.filter((b) => b.provider === "claude")) {
    const b = world.buildings.find((b) => b.provider === "codex" && b.project.id === a.project.id);
    if (b) add(a, b, "same-project");
  }
  for (const r of relations) {
    const from = world.buildings.filter((b) => b.project.id === r.from);
    const to = world.buildings.filter((b) => b.project.id === r.to);
    if (!from.length || !to.length || r.from === r.to) continue;
    let sameProvider = false;
    for (const a of from) {
      const b = to.find((b) => b.provider === a.provider);
      if (b) { add(a, b, "manual"); sameProvider = true; }
    }
    if (!sameProvider) add(from[0], to[0], "manual");
  }
  const avenue = (world.districts[0].x + world.districts[0].w + world.districts[1].x) / 2;
  return pairs.map(({ a, b, kind }) => {
    const start = { x: a.x + a.w / 2, y: a.y + a.h + ROOF_DEPTH };
    const end = { x: b.x + b.w / 2, y: b.y + b.h + ROOF_DEPTH };
    const roadA = a.lot.y + LOT_H + ROAD / 2;
    const roadB = b.lot.y + LOT_H + ROAD / 2;
    const d = world.districts.find((d) => d.provider === a.provider)!;
    const crossX = a.provider === b.provider ? d.x + BORDER + LOT_W + ROAD / 2 : avenue;
    const points = [start, { x: start.x, y: roadA }, { x: crossX, y: roadA }, { x: crossX, y: roadB }, { x: end.x, y: roadB }, end];
    return { id: relationKey(a.id, b.id), from: a.id, to: b.id, kind, points, active: [...a.sessions, ...b.sessions].some((s) => s.state === "trabajando") };
  });
}

/** Colores de los banderines: ninguno es de estado (verde, rojo, amarillo o gris). */
export const PENNANT_COLORS = ["#2BB3C0", "#E46FB0", "#3D7BE0", "#8B7CF6", "#B8743A", "#1F8F6A"] as const;

/**
 * Grupos de edificios relacionados (componentes conexos de los vínculos). Devuelve el color del banderín de
 * cada edificio que tenga alguno; el orden de los grupos sigue al de los edificios, así el color es estable.
 */
export function pennantColors(world: WorldLayout): Map<string, string> {
  const parent = new Map<string, string>();
  const find = (id: string): string => {
    const p = parent.get(id) ?? id;
    if (p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };
  for (const b of world.bridges) parent.set(find(b.from), find(b.to));
  const linked = new Set(world.bridges.flatMap((b) => [b.from, b.to]));
  const groupColor = new Map<string, string>();
  const out = new Map<string, string>();
  for (const b of world.buildings) {
    if (!linked.has(b.id)) continue;
    const root = find(b.id);
    if (!groupColor.has(root)) groupColor.set(root, PENNANT_COLORS[groupColor.size % PENNANT_COLORS.length]);
    out.set(b.id, groupColor.get(root)!);
  }
  return out;
}

/** Posición a lo largo de una pasarela; velocidad proporcional a su longitud real. */
export function pointOnPath(points: Point[], progress: number): Point {
  if (points.length < 2) return points[0] ?? { x: 0, y: 0 };
  const lengths = points.slice(1).map((p, i) => Math.hypot(p.x - points[i].x, p.y - points[i].y));
  let distance = Math.max(0, Math.min(1, progress)) * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (distance <= lengths[i] && lengths[i] > 0) {
      const k = distance / lengths[i];
      return { x: points[i].x + (points[i + 1].x - points[i].x) * k, y: points[i].y + (points[i + 1].y - points[i].y) * k };
    }
    distance -= lengths[i];
  }
  return points.at(-1)!;
}

export function buildingAt(world: WorldLayout, point: Point): MapBuilding | undefined {
  return world.buildings.find((b) => point.x >= b.x && point.x <= b.x + b.w + ROOF_DEPTH && point.y >= b.y && point.y <= b.y + b.h + ROOF_DEPTH);
}
