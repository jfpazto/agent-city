import type { Session, SessionState } from "@ciudad/shared";

export const STATES: SessionState[] = ["trabajando", "te_necesita", "para_revisar", "dormida"];

export type Summary = { counts: Record<SessionState, number>; tokens: number };

/** Contadores por estado y tokens totales (entrada + salida + lectura y escritura de caché). */
export function summarize(sessions: Session[]): Summary {
  const counts = { trabajando: 0, te_necesita: 0, para_revisar: 0, dormida: 0 };
  let tokens = 0;
  for (const s of sessions) {
    counts[s.state]++;
    const t = s.tokens;
    if (t) tokens += t.input + t.output + t.cacheRead + t.cacheCreation;
  }
  return { counts, tokens };
}

const fmt = (n: number, digits: number) =>
  n.toLocaleString("es-ES", { minimumFractionDigits: digits, maximumFractionDigits: digits });

/** 950 → «950»; 12 345 → «12,3 k»; 7 556 865 → «7,56 M»; 2,1e9 → «2,10 G». */
export function formatTokens(n: number): string {
  // Se compara con el valor ya redondeado para no mostrar «1000,0 k».
  if (Math.round(n) < 1_000) return String(Math.round(n));
  if (Math.round(n / 100) < 9_999.5) return `${fmt(n / 1_000, 1)} k`;
  if (Math.round(n / 10_000) < 99_999.5) return `${fmt(n / 1_000_000, 2)} M`;
  return `${fmt(n / 1_000_000_000, 2)} G`;
}
