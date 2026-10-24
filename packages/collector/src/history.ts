import { readFile } from "node:fs/promises";
import path from "node:path";
import type { HistoryResponse, Session, SessionState } from "@ciudad/shared";
import { createSessionStore, type HookEvent } from "./sessions.ts";

/** Una línea de `data/events/AAAA-MM-DD.jsonl` (solo metadatos). */
export type LoggedEvent = { at: number; event: HookEvent };

/** Lee los eventos de Claude de los archivos diarios que tocan [from, to). Ignora líneas rotas y los de Codex. */
export async function readEvents(dir: string, from: number, to: number): Promise<LoggedEvent[]> {
  const days = new Set<string>();
  for (let t = from; t < to + 86_400_000; t += 86_400_000) days.add(new Date(Math.min(t, to)).toISOString().slice(0, 10));
  const out: LoggedEvent[] = [];
  for (const day of [...days].sort()) {
    let text: string;
    try {
      text = await readFile(path.join(dir, `${day}.jsonl`), "utf8");
    } catch {
      continue; // día sin eventos o ya borrado por la retención
    }
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      try {
        const o = JSON.parse(line) as { receivedAt?: string; agent?: string; event?: HookEvent };
        const at = Date.parse(o.receivedAt ?? "");
        if ((o.agent ?? "claude") !== "claude" || !o.event || Number.isNaN(at) || at < from || at >= to) continue;
        out.push({ at, event: o.event });
      } catch {
        continue;
      }
    }
  }
  return out.sort((a, b) => a.at - b.at);
}

/**
 * Reconstruye la ciudad de Claude entre `from` y `to` repitiendo los eventos con la misma máquina de estados
 * (también el paso a dormida por inactividad). `warmup` son eventos anteriores a `from` para que las sesiones
 * ya abiertas empiecen con su estado. Un fotograma cada `stepMs`; el título sale de `titles` si se conoce.
 */
export function buildHistory(
  events: LoggedEvent[],
  from: number,
  to: number,
  options: { stepMs?: number; idleMs?: number; titles?: Map<string, string> } = {},
): HistoryResponse {
  const stepMs = options.stepMs ?? 5 * 60_000;
  const store = createSessionStore({ idleMs: options.idleMs });
  const sessions: HistoryResponse["sessions"] = {};
  const frames: HistoryResponse["frames"] = [];
  let i = 0;
  for (let t = from; t <= to; t += stepMs) {
    // Un turno más corto que el paso no debe perderse: el fotograma enseña lo más urgente que hubo en su intervalo.
    const peak = new Map<string, SessionState>();
    for (; i < events.length && events[i].at <= t; i++) {
      store.apply(events[i].event, new Date(events[i].at));
      const id = events[i].event.session_id;
      const s = typeof id === "string" ? store.get(id) : undefined;
      if (s && events[i].at > t - stepMs && PRIORITY[s.state] > PRIORITY[peak.get(s.id) ?? "dormida"]) peak.set(s.id, s.state);
    }
    store.tick(new Date(t));
    const list = store.list();
    for (const s of list) sessions[s.id] = slim(s, options.titles?.get(s.id));
    frames.push({
      at: new Date(t).toISOString(),
      sessions: list.map((s) => {
        const p = peak.get(s.id);
        return [s.id, p && PRIORITY[p] > PRIORITY[s.state] ? p : s.state, s.lastEventAt];
      }),
    });
  }
  return { from: new Date(from).toISOString(), to: new Date(to).toISOString(), stepMs, sessions, frames };
}

const PRIORITY: Record<SessionState, number> = { dormida: 0, para_revisar: 1, trabajando: 2, te_necesita: 3 };

/** Lo que el mapa necesita para dibujar una sesión pasada; nada de métricas ni mensajes. */
function slim(s: Session, title?: string): HistoryResponse["sessions"][string] {
  return { id: s.id, title: title ?? s.title, cwd: s.cwd, floor: s.floor, project: s.project, projectFloor: s.projectFloor };
}

/** Inicio y fin (exclusivo) de un día local AAAA-MM-DD. `undefined` si la fecha no es válida. */
export function localDayRange(day: string): { from: number; to: number } | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  if (!m) return undefined;
  const from = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
  const to = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + 1).getTime();
  return Number.isNaN(from) ? undefined : { from, to };
}
