import type { HistoryResponse, Session } from "@ciudad/shared";

/** Sesiones de un fotograma del día rebobinado (Claude y Codex), con la forma que el mapa y la fachada ya saben dibujar. */
export function frameSessions(h: HistoryResponse, index: number): Session[] {
  const frame = h.frames[Math.max(0, Math.min(index, h.frames.length - 1))];
  if (!frame) return [];
  return frame.sessions.flatMap(([id, state, lastEventAt]) => {
    const s = h.sessions[id];
    return s ? [{ ...s, agent: s.agent ?? "claude", state, lastEventAt }] : [];
  });
}

/** Hora local HH:MM de un fotograma. */
export function frameTime(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/** Los últimos `n` días locales (AAAA-MM-DD), de hoy hacia atrás: los que guarda `data/events`. */
export function replayDays(now: Date, n = 7): string[] {
  const p = (x: number) => String(x).padStart(2, "0");
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  });
}

/** Primer fotograma con alguna sesión trabajando (para empezar donde pasa algo); 0 si no hay ninguno. */
export function firstBusyFrame(h: HistoryResponse): number {
  const i = h.frames.findIndex((f) => f.sessions.some(([, state]) => state === "trabajando" || state === "te_necesita"));
  return Math.max(0, i);
}
