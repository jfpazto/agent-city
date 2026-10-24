import type { Viewport } from "./layout.ts";

// Cámara de la torre: pantalla = posición + zoom · mundo.
export type Camera = { x: number; y: number; zoom: number };
export type Bounds = { top: number; bottom: number; left: number; right: number };

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 2;
// Margen sobre el rótulo: deja hueco para las dos filas de controles (64 px) y 16 px de aire.
export const TOP_MARGIN = 80;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

function clampAxis(pos: number, zoom: number, lo: number, hi: number, size: number, anchorEnd: boolean): number {
  const content = (hi - lo) * zoom;
  if (content <= size) return anchorEnd ? size - zoom * hi : (size - zoom * (lo + hi)) / 2;
  return clamp(pos, size - zoom * hi, -zoom * lo);
}

/** Que no quede hueco: en vertical, si todo cabe, el suelo va abajo; en horizontal, centrado. */
export function clampCamera(cam: Camera, b: Bounds, vp: Viewport): Camera {
  const zoom = clamp(cam.zoom, ZOOM_MIN, ZOOM_MAX);
  return {
    zoom,
    x: clampAxis(cam.x, zoom, b.left, b.right, vp.width, false),
    y: clampAxis(cam.y, zoom, b.top, b.bottom, vp.height, true),
  };
}

/** Rueda hacia abajo → se ve lo de abajo (el contenido sube). */
export function scrollBy(cam: Camera, deltaY: number, deltaX = 0): Camera {
  return { ...cam, x: cam.x - deltaX, y: cam.y - deltaY };
}

/** Zoom con el punto (cx, cy) de la pantalla fijo. */
export function zoomAt(cam: Camera, factor: number, cx: number, cy: number): Camera {
  const zoom = clamp(cam.zoom * factor, ZOOM_MIN, ZOOM_MAX);
  const k = zoom / cam.zoom;
  return { zoom, x: cx - (cx - cam.x) * k, y: cy - (cy - cam.y) * k };
}

/** Factor de zoom de un evento de rueda: suave y simétrico (deltaY negativo acerca). */
export function wheelZoomFactor(deltaY: number): number {
  return Math.exp(-deltaY * 0.002);
}

/** Límites del mundo: de un poco por encima de la torre hasta el suelo, a todo el ancho. */
export function worldBounds(towerTop: number, vp: Viewport, worldWidth = vp.width): Bounds {
  return { top: Math.min(0, towerTop - TOP_MARGIN), bottom: vp.height, left: 0, right: Math.max(vp.width, worldWidth) };
}

/** Cámara que deja el rectángulo (en coordenadas del mundo) en el centro de la pantalla, sin cambiar el zoom. */
export function centerOn(cam: Camera, rect: { x: number; y: number; w: number; h: number }, vp: Viewport): Camera {
  return {
    zoom: cam.zoom,
    x: vp.width / 2 - cam.zoom * (rect.x + rect.w / 2),
    y: vp.height / 2 - cam.zoom * (rect.y + rect.h / 2),
  };
}
