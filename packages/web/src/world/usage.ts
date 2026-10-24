import type { AgentProvider, UsageLimits, UsageWindow } from "@ciudad/shared";
import type { District, Rect } from "./model.ts";

export type WindowState = "ok" | "bajo" | "agotado" | "recargado" | "sin_dato";
/** Una ventana lista para pintar: `remaining` es lo que queda (0-100), null si no hay dato que mostrar. */
export type WindowView = { state: WindowState; remaining: number | null; resetsAt?: Date };
export type UsageView = { provider: AgentProvider; fiveHour: WindowView; weekly: WindowView };

const LOW = 20;
/** Más allá de esto el dato no se enseña aunque su recarga no haya llegado (reloj raro, archivo viejo). */
const MAX_AGE_MS = { fiveHour: 6 * 3_600_000, weekly: 7 * 86_400_000 };

function windowView(w: UsageWindow | undefined, observedAt: number, maxAgeMs: number, now: Date): WindowView {
  const resetsAt = w ? new Date(w.resetsAt) : undefined;
  if (!w || !resetsAt || Number.isNaN(resetsAt.getTime())) return { state: "sin_dato", remaining: null };
  // Pasada la recarga, la ventana está llena: nunca se enseña la cifra anterior.
  if (resetsAt.getTime() <= now.getTime()) return { state: "recargado", remaining: 100 };
  if (!Number.isFinite(observedAt) || now.getTime() - observedAt > maxAgeMs) return { state: "sin_dato", remaining: null };
  const remaining = Math.round(Math.max(0, Math.min(100, 100 - w.usedPercent)));
  return { state: remaining <= 0 ? "agotado" : remaining < LOW ? "bajo" : "ok", remaining, resetsAt };
}

/** Estado de las dos ventanas de un proveedor en `now`. Puro. */
export function usageView(provider: AgentProvider, limits: UsageLimits | undefined, now: Date): UsageView {
  const observed = limits ? Date.parse(limits.observedAt) : NaN;
  return {
    provider,
    fiveHour: windowView(limits?.fiveHour, observed, MAX_AGE_MS.fiveHour, now),
    weekly: windowView(limits?.weekly, observed, MAX_AGE_MS.weekly, now),
  };
}

const DAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const hhmm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/** Hora de recarga corta: «18:40» si es hoy o antes de 24 h, «vie 09:00» si es más tarde. */
export function resetLabel(at: Date, now: Date): string {
  return at.getTime() - now.getTime() < 86_400_000 && at.getDate() === now.getDate() ? hhmm(at) : `${DAYS[at.getDay()]} ${hhmm(at)}`;
}

function windowText(w: WindowView, name: string, now: Date): string {
  if (w.state === "sin_dato") return `${name}: sin dato reciente`;
  if (w.state === "recargado") return `${name}: recargado`;
  return `${name}: quedan ${w.remaining} %, recarga ${resetLabel(w.resetsAt!, now)}`;
}

/** Frase completa para lectores de pantalla y para el título del rótulo. */
export function usageSummary(v: UsageView, now: Date): string {
  const who = v.provider === "claude" ? "Límite de Claude" : "Límite de Codex";
  return `${who} · ${windowText(v.fiveHour, "5 h", now)} · ${windowText(v.weekly, "semana", now)}`;
}

/** Texto visible junto al depósito o la central: corto de lejos, con hora de recarga de cerca. */
export function usageShortText(v: UsageView, now: Date, distant: boolean): string {
  const w = v.fiveHour;
  if (w.state === "sin_dato") return v.weekly.state === "sin_dato" ? "sin dato" : `sem. ${v.weekly.remaining} %`;
  if (w.state === "recargado") return distant ? "100 %" : "recargado";
  return distant ? `${w.remaining} %` : `${w.remaining} % · ${resetLabel(w.resetsAt!, now)}`;
}

/** Hueco del depósito o la central: esquina derecha de la franja de rótulo, sin tocar los solares (empiezan en y + 64). */
export function facilityRect(d: District): Rect {
  return { x: d.x + d.w - 92, y: d.y + 4, w: 80, h: 56 };
}

/** Límites de demostración: Claude con margen, Codex casi agotado. */
export function demoUsage(now: Date): UsageLimits[] {
  const at = (h: number) => new Date(now.getTime() + h * 3_600_000).toISOString();
  return [
    { provider: "claude", observedAt: now.toISOString(), fiveHour: { usedPercent: 68, resetsAt: at(2.5), windowMinutes: 300 }, weekly: { usedPercent: 30, resetsAt: at(80), windowMinutes: 10080 } },
    { provider: "codex", observedAt: now.toISOString(), fiveHour: { usedPercent: 94, resetsAt: at(1.2), windowMinutes: 300 }, weekly: { usedPercent: 55, resetsAt: at(120), windowMinutes: 10080 } },
  ];
}
