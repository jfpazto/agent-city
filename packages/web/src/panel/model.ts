import type { Session } from "@ciudad/shared";
import { FAILURE_LABEL, STATE_STYLE, type TowerLayout } from "../tower/layout.ts";
import { formatTokens } from "../hud/summary.ts";
import type { Camera } from "../tower/camera.ts";
import { BUILDING_LABEL_H, sessionProject, type CityLayout } from "../tower/city.ts";

/** Id del piso de sesión bajo el punto de la pantalla, o null (EN VENTA, hueco, fuera de la torre). */
export function sessionAt(layout: TowerLayout, cam: Camera, sx: number, sy: number): string | null {
  const x = (sx - cam.x) / cam.zoom;
  const y = (sy - cam.y) / cam.zoom;
  for (const c of layout.cells) {
    if (c.kind === "session" && x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h) return c.id;
  }
  return null;
}

/** Volumen lateral y azotea dibujados por TowerView (fuera del rectángulo frontal). */
const SIDE_DEPTH = 28, ROOF_RISE = 18;

/** ¿El punto de la pantalla cae sobre un edificio (fachada, placa, azotea o lateral)? Fuera: cielo o calle. */
export function onBuilding(layout: CityLayout, cam: Camera, sx: number, sy: number): boolean {
  const x = (sx - cam.x) / cam.zoom;
  const y = (sy - cam.y) / cam.zoom;
  return layout.buildings.some((b) =>
    x >= b.x && x < b.x + b.w + SIDE_DEPTH && y >= b.y - BUILDING_LABEL_H - ROOF_RISE && y < layout.groundY);
}

/** ¿El punto cae sobre un piso libre («en venta»)? */
export function forSaleAt(layout: TowerLayout, cam: Camera, sx: number, sy: number): boolean {
  const x = (sx - cam.x) / cam.zoom;
  const y = (sy - cam.y) / cam.zoom;
  return layout.cells.some((c) => c.kind === "for_sale" && x >= c.x && x < c.x + c.w && y >= c.y && y < c.y + c.h);
}

/** Distancia (px de pantalla) que hay que deslizar un piso a la derecha para eliminarlo. */
export const SWIPE_DELETE = 120;

/** Un arrastre es «deslizar para eliminar» si va claramente a la derecha y más en horizontal que en vertical. */
export function isSwipe(dx: number, dy: number): boolean {
  return dx > 8 && Math.abs(dx) > Math.abs(dy) * 1.5;
}

/** Botón ▶ «abrir la sesión», arriba a la derecha de cada piso con sesión (coordenadas del piso). */
export const OPEN_BUTTON = { w: 26, h: 22, right: 8, top: 8 };

/** Id de la sesión cuyo botón ▶ está bajo el puntero, o null. */
export function openButtonAt(layout: TowerLayout, cam: Camera, sx: number, sy: number): string | null {
  const x = (sx - cam.x) / cam.zoom;
  const y = (sy - cam.y) / cam.zoom;
  for (const c of layout.cells) {
    if (c.kind !== "session") continue;
    const bx = c.x + c.w - OPEN_BUTTON.right - OPEN_BUTTON.w, by = c.y + OPEN_BUTTON.top;
    if (x >= bx && x < bx + OPEN_BUTTON.w && y >= by && y < by + OPEN_BUTTON.h) return c.id;
  }
  return null;
}

const num = (n: number) => n.toLocaleString("es-ES");

/** «2,73 $»; menos de un céntimo, «< 0,01 $»; sin dato, «—». */
export function formatUsd(n: number | undefined): string {
  if (n === undefined) return "—";
  if (n > 0 && n < 0.01) return "< 0,01 $";
  return `${n.toLocaleString("es-ES", { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false })} $`;
}

/** «hace 5 s», «hace 12 min», «hace 3 h», «hace 2 d». */
export function relativeTime(iso: string, now: Date): string {
  const s = Math.max(0, Math.round((now.getTime() - Date.parse(iso)) / 1000));
  if (s < 60) return `hace ${s} s`;
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  return `hace ${Math.floor(s / 86400)} d`;
}

export type PanelModel = {
  title: string;
  stateLabel: string;
  stateColor: string;
  model: string;
  lastActivity: string;
  cwd: string;
  projectName: string;
  projectRoot: string;
  rows: [string, string][];
  files: string[];
};

/** Lo que muestra el panel, ya formateado (puro). Sin dato, «—»: nunca un cero inventado. */
/** «2 trabajando · 5 en total»; «—» si la sesión no informa (Codex o colector anterior). */
export function subagentsLabel(s: Session): string {
  if (s.subagentsTotal === undefined && s.subagentsActive === undefined) return "—";
  const active = s.subagentsActive ?? 0;
  const total = Math.max(s.subagentsTotal ?? 0, active);
  return active > 0 ? `${num(active)} trabajando · ${num(total)} en total` : num(total);
}

export function panelModel(s: Session, now: Date): PanelModel {
  const st = STATE_STYLE[s.state];
  const t = s.tokens;
  const total = t ? t.input + t.output + t.cacheRead + t.cacheCreation : undefined;
  return {
    title: s.title,
    stateLabel: st.label,
    stateColor: st.color,
    model: s.model ?? "—",
    lastActivity: relativeTime(s.lastEventAt, now),
    cwd: s.cwd ?? "—",
    projectName: sessionProject(s).name,
    projectRoot: sessionProject(s).root ?? "—",
    rows: [
      ["Coste estimado", formatUsd(s.costUsd)],
      ["Tokens", total === undefined ? "—" : `${formatTokens(total)} (${num(total)})`],
      ["· entrada", t ? num(t.input) : "—"],
      ["· salida", t ? num(t.output) : "—"],
      ["· caché leída", t ? num(t.cacheRead) : "—"],
      ["· caché escrita", t ? num(t.cacheCreation) : "—"],
      ["Comandos", s.tools ? num(s.tools.commands) : "—"],
      ["Lecturas", s.tools ? num(s.tools.reads) : "—"],
      ["Acciones web", s.tools ? num(s.tools.web) : "—"],
      ["Archivos editados", s.editedFiles ? num(s.editedFiles.length) : "—"],
      ["Subagentes", subagentsLabel(s)],
      ["Contexto", s.contextPercent === undefined ? "—" : `${s.contextPercent} % usado`],
      ["Avería", s.failure ? `${FAILURE_LABEL[s.failure.kind]} (${relativeTime(s.failure.at, now)})` : "—"],
    ],
    files: s.editedFiles ?? [],
  };
}

const WEEKDAY = ["do", "lu", "ma", "mi", "ju", "vi", "sá"];

/** Barras del gráfico semanal: altura relativa al día con más tokens (0 si no hay ninguno). */
export function chartBars(daily: { day: string; tokens: number }[]): { label: string; day: string; tokens: number; pct: number }[] {
  const max = Math.max(0, ...daily.map((d) => d.tokens));
  return daily.map((d) => {
    const [y, m, dd] = d.day.split("-").map(Number);
    return {
      day: d.day,
      label: WEEKDAY[new Date(y, m - 1, dd).getDay()],
      tokens: d.tokens,
      pct: max > 0 ? Math.round((d.tokens / max) * 100) : 0,
    };
  });
}

/** Bitácora para el panel: la más reciente primero, con hora relativa y «×N» si se repitió. */
export function logLines(log: { at: string; label: string; count: number }[] | undefined, now: Date): string[] {
  return [...(log ?? [])].reverse().map((e) => `${relativeTime(e.at, now)} · ${e.label}${e.count > 1 ? ` ×${e.count}` : ""}`);
}

export const QUICK_REPLIES = ["Sí, continúa", "No, para aquí", "Explícame el plan antes de seguir"];

/** Lo que copia «Abrir sesión» cuando no hay deep link: título y carpeta, para buscarla a mano en la app. */
export function sessionClipboardText(s: { title: string; cwd?: string; id: string }): string {
  return `${s.title}\n${s.cwd ?? "(carpeta desconocida)"}\nsesión ${s.id}`;
}

/** Número exacto con separador de miles («1.234.567»). */
export function formatTokensExact(n: number): string {
  return n.toLocaleString("es-ES");
}

/** Fecha local AAAA-MM-DD (igual que el colector) para marcar «hoy» en el gráfico. */
export function localDayKey(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
