import type { Session, SessionState, SessionFailure } from "@ciudad/shared";

// Medidas de DESIGN.md.
export const FLOOR_W = 180;
export const FLOOR_H = 96;
export const FRAME = 4;
export const SHAFT_W = 40;
export const GROUND_H = 48;
export const MIN_ROWS = 4;
export const TITLE_MAX = 18;

export type FloorCell =
  | { kind: "session"; floor: number; x: number; y: number; w: number; h: number; initials: string; title: string; state: SessionState; id: string; bubble: string[] | null; helpers?: number; failure?: SessionFailure["kind"]; context?: number }
  | { kind: "for_sale"; floor: number; x: number; y: number; w: number; h: number };

export type TowerLayout = { cells: FloorCell[]; tower: { x: number; y: number; w: number; h: number }; groundY: number };

export type Viewport = { width: number; height: number };

/** Hasta 2 letras en mayúscula: inicial de las dos primeras palabras, o las dos primeras letras si hay una sola. */
export function initials(title: string): string {
  const words = title
    .split(/[\s\-_]+/)
    .map((w) => w.replace(/[^\p{L}]/gu, ""))
    .filter((w) => w.length > 0);
  if (words.length === 0) return "??";
  const s = words.length === 1 ? words[0].slice(0, 2) : words[0][0] + words[1][0];
  return s.toUpperCase();
}

/** Textos de la avería por tipo de error (nunca el mensaje de la API). */
export const FAILURE_LABEL: Record<SessionFailure["kind"], string> = {
  rate_limit: "límite de uso",
  auth: "sesión caducada",
  api: "error de la API",
};

/** Nivel del indicador de contexto: aviso desde el 70 %, crítico desde el 85 %. */
export function contextLevel(percent: number): "ok" | "aviso" | "critico" {
  return percent >= 85 ? "critico" : percent >= 70 ? "aviso" : "ok";
}

/** Recorta a `max` caracteres con «…» al final. */
export function truncate(text: string, max = TITLE_MAX): string {
  const chars = [...text];
  return chars.length <= max ? text : chars.slice(0, max - 1).join("") + "…";
}

/** Disposición pura de la torre: planta f → fila floor(f/2), columna f%2; la fila 0 junto al suelo. */
export function layoutTower(sessions: Session[], viewport: Viewport): TowerLayout {
  const byFloor = new Map<number, Session>();
  for (const s of sessions) byFloor.set(s.floor, s);
  const topRow = sessions.length ? Math.max(...sessions.map((s) => Math.floor(s.floor / 2))) : -1;
  const rows = Math.max(MIN_ROWS, topRow + 2);

  const w = FRAME * 2 + FLOOR_W * 2 + SHAFT_W;
  const h = FRAME + rows * (FLOOR_H + FRAME);
  const groundY = Math.round(viewport.height - GROUND_H);
  const tower = { x: Math.round((viewport.width - w) / 2), y: groundY - h, w, h };

  const cells: FloorCell[] = [];
  for (let floor = 0; floor < rows * 2; floor++) {
    const row = Math.floor(floor / 2);
    const col = floor % 2;
    const x = tower.x + FRAME + col * (FLOOR_W + SHAFT_W);
    const y = groundY - (row + 1) * (FLOOR_H + FRAME);
    const s = byFloor.get(floor);
    cells.push(
      s
        ? { kind: "session", floor, x, y, w: FLOOR_W, h: FLOOR_H, initials: initials(s.title), title: truncate(s.title), state: s.state, id: s.id, bubble: bubbleFor(s) }
        : { kind: "for_sale", floor, x, y, w: FLOOR_W, h: FLOOR_H },
    );
  }
  return { cells, tower, groundY };
}

// Estilo de estado (DESIGN.md): color, etiqueta, icono pixel y parpadeo.
export type StateStyle = { color: string; label: string; icon: string[]; blink: boolean };

export const ICONS = {
  gear: ["0101010", "1111111", "0110110", "1100011", "0110110", "1111111", "0101010"],
  alert: ["0011100", "0011100", "0011100", "0011100", "0000000", "0011100", "0011100"],
  check: ["0000001", "0000011", "0000110", "1001100", "1111000", "0110000", "0000000"],
  zzz: ["1111111", "0000011", "0000110", "0001100", "0011000", "0110000", "1111111"],
};

export const STATE_STYLE: Record<SessionState, StateStyle> = {
  trabajando: { color: "#3DDC84", label: "TRABAJANDO", icon: ICONS.gear, blink: false },
  te_necesita: { color: "#E5484D", label: "TE NECESITA", icon: ICONS.alert, blink: true },
  para_revisar: { color: "#F5C542", label: "REVISAR", icon: ICONS.check, blink: false },
  dormida: { color: "#4A5068", label: "DORMIDA", icon: ICONS.zzz, blink: false },
};

export const BLINK_PERIOD_MS = 1600;

/** Parpadeo suave: opacidad entre 0,35 y 0,85, nunca se apaga del todo. */
export function blinkAlpha(ms: number): number {
  return 0.6 + 0.25 * Math.sin((2 * Math.PI * ms) / BLINK_PERIOD_MS);
}

/** Opacidad de la capa de brillo del piso. `dormida` es un relleno gris opaco. */
export function glowAlpha(state: SessionState, ms: number): number {
  if (state === "dormida") return 1;
  return STATE_STYLE[state].blink ? blinkAlpha(ms) : 0.55;
}

/** Celdas encendidas de un icono como [col, fila]. */
export function iconPixels(icon: string[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  icon.forEach((row, y) => [...row].forEach((v, x) => v === "1" && out.push([x, y])));
  return out;
}

// Bocadillo (needs-you-bubble): solo en rojo y con mensaje.
export const BUBBLE_CHARS = 26;
export const BUBBLE_LINES = 2;

/** Parte el texto en hasta `maxLines` líneas de `maxChars`; si sobra, la última acaba en «…». */
export function wrapText(text: string, maxChars = BUBBLE_CHARS, maxLines = BUBBLE_LINES): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w0 of words) {
    let w = w0;
    while ([...w].length > maxChars) {
      if (cur) { lines.push(cur); cur = ""; }
      lines.push([...w].slice(0, maxChars).join(""));
      w = [...w].slice(maxChars).join("");
    }
    const next = cur ? `${cur} ${w}` : w;
    if ([...next].length <= maxChars) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  const rest = lines.length > maxLines;
  const out = lines.slice(0, maxLines);
  if (rest) out[maxLines - 1] = truncate(out[maxLines - 1] + "…", maxChars);
  return out;
}

export function bubbleFor(s: Pick<Session, "state" | "lastMessage">): string[] | null {
  if (s.state !== "te_necesita" || !s.lastMessage?.trim()) return null;
  return wrapText(s.lastMessage);
}
