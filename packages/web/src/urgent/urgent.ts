import type { Session } from "@ciudad/shared";

/** Un piso es urgente tras más de 1 minuto seguido en te_necesita. */
export const URGENT_MS = 60_000;

/** Inicio del rojo de cada sesión y sesiones ya vistas por el front. */
export type RedTracker = { redSince: Map<string, number>; known: Set<string> };

export const emptyTracker = (): RedTracker => ({ redSince: new Map(), known: new Set() });

/**
 * Actualiza el inicio del rojo. Session no trae «desde cuándo en rojo»: si el front
 * ve la sesión por primera vez (snapshot), usa lastEventAt; si ya la conocía en otro
 * estado, la hora de la transición (now).
 */
export function trackRed(prev: RedTracker, sessions: Session[], now: number): RedTracker {
  const redSince = new Map<string, number>();
  const known = new Set<string>();
  for (const s of sessions) {
    known.add(s.id);
    if (s.state !== "te_necesita") continue;
    const before = prev.redSince.get(s.id);
    if (before !== undefined) redSince.set(s.id, before);
    else if (prev.known.has(s.id)) redSince.set(s.id, now);
    else {
      const t = Date.parse(s.lastEventAt);
      redSince.set(s.id, Number.isFinite(t) ? Math.min(t, now) : now);
    }
  }
  return { redSince, known };
}

/** Sesiones urgentes, la que más lleva en rojo primero. */
export function urgentSessions(sessions: Session[], tracker: RedTracker, now: number, thresholdMs = URGENT_MS): Session[] {
  return sessions
    .filter((s) => {
      const since = tracker.redSince.get(s.id);
      return s.state === "te_necesita" && since !== undefined && now - since > thresholdMs;
    })
    .sort((a, b) => tracker.redSince.get(a.id)! - tracker.redSince.get(b.id)! || a.floor - b.floor);
}

/** Umbral: `?urgentMs=N` solo en desarrollo, para probar sin esperar; si no, 60 s. */
export function urgentThreshold(search: string, dev: boolean): number {
  if (!dev) return URGENT_MS;
  const n = Number.parseInt(new URLSearchParams(search).get("urgentMs") ?? "", 10);
  return Number.isFinite(n) && n >= 0 ? n : URGENT_MS;
}

/** Texto de la pancarta: «1 te necesita: título» o «3 te necesitan: título…» (título del primero, recortado). */
export function bannerText(urgent: Session[], maxTitle = 32): string {
  if (urgent.length === 0) return "";
  const raw = urgent[0].title.trim() || "sin título";
  const title = raw.length > maxTitle ? `${raw.slice(0, maxTitle - 1)}…` : raw;
  const n = urgent.length;
  return `${n} te ${n === 1 ? "necesita" : "necesitan"}: ${title}${n > 1 && !title.endsWith("…") ? "…" : ""}`;
}

/** Duración de una pasada de la avioneta. */
export const FLIGHT_MS = 14_000;

/**
 * Posición x (pantalla) del morro de la avioneta: entra por la izquierda con la pancarta
 * fuera de pantalla y sale por la derecha. null cuando la pasada ha terminado.
 */
export function planeX(elapsedMs: number, viewportW: number, totalW: number, durationMs = FLIGHT_MS): number | null {
  if (elapsedMs < 0 || elapsedMs > durationMs) return null;
  return Math.round((elapsedMs / durationMs) * (viewportW + totalW));
}
