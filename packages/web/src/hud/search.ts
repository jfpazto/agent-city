import type { Session } from "@ciudad/shared";
import { sessionProject } from "../tower/city.ts";
import { providerOf } from "../world/model.ts";

/** Minúsculas y sin tildes, para buscar «revision» y encontrar «Revisión». */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Ids de las sesiones cuyo título contiene la búsqueda, de la planta más baja a la más alta. Vacía → ninguna. */
export function matchSessions(sessions: Session[], query: string): string[] {
  const q = normalize(query);
  if (!q) return [];
  return sessions
    .filter((s) => normalize(`${s.title} ${sessionProject(s).name} ${sessionProject(s).root ?? ""} ${providerOf(s)}`).includes(q))
    .sort((a, b) => providerOf(a).localeCompare(providerOf(b)) || sessionProject(a).id.localeCompare(sessionProject(b).id) || (a.projectFloor ?? a.floor) - (b.projectFloor ?? b.floor))
    .map((s) => s.id);
}

/** Siguiente resultado (Intro): da la vuelta al llegar al final. Si el actual ya no está, el primero. */
export function nextMatch(matches: string[], current: string | null): string | null {
  if (matches.length === 0) return null;
  const i = current ? matches.indexOf(current) : -1;
  return matches[(i + 1) % matches.length];
}
