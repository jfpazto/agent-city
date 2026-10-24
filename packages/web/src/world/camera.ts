import type { Camera } from "../tower/camera.ts";
import type { Point, Rect } from "./model.ts";

export const MAP_MIN_ZOOM = 0.18;
export const MAP_MAX_ZOOM = 2;
const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x));

export function fitMap(rect: Rect, viewport: Rect): Camera {
  const zoom = clamp(Math.min((viewport.w - 32) / rect.w, (viewport.h - 32) / rect.h), MAP_MIN_ZOOM, 1.15);
  return { x: viewport.x + viewport.w / 2 - zoom * (rect.x + rect.w / 2), y: viewport.y + viewport.h / 2 - zoom * (rect.y + rect.h / 2), zoom };
}

/** Centro si cabe; extremos acotados a los límites reales, con un margen para respirar. */
export function clampMap(cam: Camera, bounds: Rect, viewport: Rect): Camera {
  const zoom = clamp(cam.zoom, MAP_MIN_ZOOM, MAP_MAX_ZOOM);
  const axis = (p: number, start: number, extent: number, offset: number, size: number) =>
    extent * zoom <= size ? offset + (size - extent * zoom) / 2 - start * zoom
      : clamp(p, offset + size - (start + extent) * zoom - 24, offset - start * zoom + 24);
  return { zoom, x: axis(cam.x, bounds.x, bounds.w, viewport.x, viewport.w), y: axis(cam.y, bounds.y, bounds.h, viewport.y, viewport.h) };
}

export function zoomMap(cam: Camera, factor: number, cursor: Point): Camera {
  const zoom = clamp(cam.zoom * factor, MAP_MIN_ZOOM, MAP_MAX_ZOOM), k = zoom / cam.zoom;
  return { zoom, x: cursor.x - (cursor.x - cam.x) * k, y: cursor.y - (cursor.y - cam.y) * k };
}

export function mapPoint(cam: Camera, screen: Point): Point {
  return { x: (screen.x - cam.x) / cam.zoom, y: (screen.y - cam.y) / cam.zoom };
}
