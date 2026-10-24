import fs from "node:fs";
import path from "node:path";
import type { AgentProvider, UsageLimits, UsageWindow } from "@ciudad/shared";

export const FIVE_HOURS = 300;
export const ONE_WEEK = 10_080;

/** Ventana válida o undefined. `resetsAtSec` en segundos epoch; el porcentaje se recorta a 0-100. */
function windowOf(used: unknown, resetsAtSec: unknown, windowMinutes: number): UsageWindow | undefined {
  const pct = Number(used);
  const reset = Number(resetsAtSec);
  if (used === null || used === undefined || !Number.isFinite(pct) || !Number.isFinite(reset) || reset <= 0) return undefined;
  return { usedPercent: Math.min(100, Math.max(0, pct)), resetsAt: new Date(reset * 1000).toISOString(), windowMinutes };
}

/**
 * Límites de Codex desde el `rate_limits` de un evento `token_count`. `primary`/`secondary` se asignan por
 * `window_minutes` (300 → 5 h, 10080 → semanal); cualquier otra ventana se ignora.
 */
export function codexLimits(rateLimits: unknown, observedAt: string): UsageLimits | undefined {
  if (!rateLimits || typeof rateLimits !== "object") return undefined;
  const out: UsageLimits = { provider: "codex", observedAt };
  for (const key of ["primary", "secondary"] as const) {
    const w = (rateLimits as Record<string, any>)[key];
    if (!w || typeof w !== "object") continue;
    const minutes = Number(w.window_minutes);
    const win = windowOf(w.used_percent, w.resets_at, minutes);
    if (!win) continue;
    if (minutes === FIVE_HOURS) out.fiveHour = win;
    else if (minutes === ONE_WEEK) out.weekly = win;
  }
  return out.fiveHour || out.weekly ? out : undefined;
}

/** Límites de Claude desde el JSON de la statusline. Solo se lee `rate_limits`; el resto del JSON se descarta. */
export function claudeLimits(statusline: unknown, observedAt: string): UsageLimits | undefined {
  const rl = (statusline as { rate_limits?: Record<string, any> } | null)?.rate_limits;
  if (!rl || typeof rl !== "object") return undefined;
  const out: UsageLimits = { provider: "claude", observedAt };
  const five = windowOf(rl.five_hour?.used_percentage, rl.five_hour?.resets_at, FIVE_HOURS);
  const week = windowOf(rl.seven_day?.used_percentage, rl.seven_day?.resets_at, ONE_WEEK);
  if (five) out.fiveHour = five;
  if (week) out.weekly = week;
  return out.fiveHour || out.weekly ? out : undefined;
}

export type UsageStore = {
  list(): UsageLimits[];
  /** Guarda el dato si es más reciente que el que había. Devuelve true si cambió algo. */
  set(limits: UsageLimits): boolean;
  subscribe(fn: (limits: UsageLimits) => void): () => void;
};

/** Último límite por proveedor. Con `file`, se conserva entre reinicios del colector (`data/usage.json`). */
export function createUsageStore(file?: string): UsageStore {
  const byProvider = new Map<AgentProvider, UsageLimits>();
  const listeners = new Set<(l: UsageLimits) => void>();
  if (file) {
    try {
      for (const l of JSON.parse(fs.readFileSync(file, "utf8")) as UsageLimits[]) {
        if ((l?.provider === "claude" || l?.provider === "codex") && typeof l.observedAt === "string") byProvider.set(l.provider, l);
      }
    } catch {
      // Sin archivo o corrupto: se empieza sin datos.
    }
  }
  const save = () => {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify([...byProvider.values()], null, 2) + "\n");
    } catch (err) {
      console.error("[collector] no se pudo guardar el límite de uso", err);
    }
  };
  return {
    list: () => [...byProvider.values()],
    set(limits) {
      const prev = byProvider.get(limits.provider);
      // Un dato igual de antiguo o más no sustituye al actual; uno más nuevo sí, aunque repita cifras (renueva `observedAt`).
      if (prev && Date.parse(prev.observedAt) >= Date.parse(limits.observedAt)) return false;
      byProvider.set(limits.provider, limits);
      save();
      for (const fn of listeners) fn(limits);
      return true;
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
