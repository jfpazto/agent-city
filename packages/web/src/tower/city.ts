import type { Project, Session } from "@ciudad/shared";
import { bubbleFor, FLOOR_H, FRAME, GROUND_H, initials, truncate, type FloorCell, type TowerLayout, type Viewport } from "./layout.ts";

export const BUILDING_FLOOR_W = 240;
export const BUILDING_GAP = 48;
export const BUILDING_LABEL_H = 32;
const MARGIN = 24;
const WIDTH = BUILDING_FLOOR_W + 2 * FRAME;

export type Building = {
  project: Project;
  x: number; y: number; w: number; h: number;
  label: string;
};
export type CityLayout = TowerLayout & { buildings: Building[]; worldWidth: number };

/** Compatibilidad con colectores antiguos: agrupar por carpeta hasta disponer de identidad Git. */
export function sessionProject(s: Session): Project {
  if (s.project) return s.project;
  if (s.cwd) {
    const root = s.cwd.replace(/\/+$/, "") || "/";
    return { id: `folder:${root}`, name: root.split("/").pop() || root, root };
  }
  return { id: "unknown", name: "Sin proyecto" };
}

/** Un proyecto/agente por edificio, una sesión por piso. `order` fija los solares durante la conexión. */
export function layoutCity(sessions: Session[], viewport: Viewport, order?: string[]): CityLayout {
  const groups = new Map<string, { project: Project; sessions: Session[] }>();
  for (const session of sessions) {
    const project = sessionProject(session);
    let group = groups.get(project.id);
    if (!group) groups.set(project.id, group = { project, sessions: [] });
    group.sessions.push(session);
  }
  const ids = groups.size ? [...(order ?? []), ...groups.keys()].filter((id, i, all) => all.indexOf(id) === i) : [];
  const slots = new Map<string, number>();
  const used = new Set<number>();
  // El orden del colector sobrevive a la recarga del front, aunque cierre la sesión más antigua de un edificio.
  for (const id of ids) {
    const preferred = groups.get(id)?.project.order;
    if (Number.isInteger(preferred) && preferred! >= 0 && !used.has(preferred!)) {
      slots.set(id, preferred!);
      used.add(preferred!);
    }
  }
  for (const id of ids) {
    if (slots.has(id)) continue;
    let slot = 0;
    while (used.has(slot)) slot++;
    slots.set(id, slot);
    used.add(slot);
  }
  const slotCount = used.size ? Math.max(...used) + 1 : 0;
  const contentWidth = slotCount ? slotCount * WIDTH + (slotCount - 1) * BUILDING_GAP : 0;
  const worldWidth = Math.max(viewport.width, contentWidth + 2 * MARGIN);
  const startX = Math.round((worldWidth - contentWidth) / 2);
  const groundY = Math.round(viewport.height - GROUND_H);
  const buildings: Building[] = [];
  const cells: FloorCell[] = [];
  ids.forEach((id) => {
    const group = groups.get(id);
    if (!group) return;
    const slot = slots.get(id)!;
    const byFloor = new Map<number, Session>();
    // Pisos compactos por actividad: la sesión más antigua abajo y la más reciente arriba, sin huecos;
    // así solo queda un piso «en venta», encima de la más reciente.
    const at = (s: Session) => Date.parse(s.lastEventAt) || 0;
    const sorted = [...group.sessions].sort((a, b) => at(a) - at(b) || a.id.localeCompare(b.id));
    sorted.forEach((s, floor) => byFloor.set(floor, s));
    const rows = Math.max(2, Math.max(...byFloor.keys()) + 2);
    const h = rows * (FLOOR_H + FRAME) + FRAME;
    const x = startX + slot * (WIDTH + BUILDING_GAP);
    const y = groundY - h;
    // Si hay nombres iguales, la raíz distingue los edificios sin confundir sus identidades.
    const duplicateName = [...groups.values()].some((g) => g.project.id !== id && g.project.name === group.project.name);
    const label = duplicateName ? `${group.project.name} · ${slot + 1}` : group.project.name;
    buildings.push({ project: group.project, x, y, w: WIDTH, h, label });
    for (let floor = 0; floor < rows; floor++) {
      const rect = { floor, x: x + FRAME, y: groundY - (floor + 1) * (FLOOR_H + FRAME), w: BUILDING_FLOOR_W, h: FLOOR_H };
      const s = byFloor.get(floor);
      cells.push(s
        ? { ...rect, kind: "session", id: s.id, initials: initials(s.title), title: truncate(s.title, 30), state: s.state, bubble: bubbleFor(s), helpers: s.subagentsActive ?? 0, failure: s.failure?.kind, context: s.contextPercent }
        : { ...rect, kind: "for_sale" });
    }
  });
  const top = buildings.length ? Math.min(...buildings.map((b) => b.y - BUILDING_LABEL_H)) : groundY;
  return { cells, buildings, worldWidth, groundY, tower: { x: startX, y: top, w: contentWidth, h: groundY - top } };
}
