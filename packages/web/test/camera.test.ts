import { describe, expect, it } from "vitest";
import { clampCamera, scrollBy, wheelZoomFactor, worldBounds, zoomAt, ZOOM_MAX, ZOOM_MIN } from "../src/tower/camera.ts";
import { layoutTower } from "../src/tower/layout.ts";
import type { Session } from "@ciudad/shared";

const vp = { width: 1000, height: 600 };
const sessions = (n: number): Session[] =>
  Array.from({ length: n }, (_, i) => ({ id: `${i}`, title: `s ${i}`, state: "trabajando", floor: i, lastEventAt: "2026-10-19T10:00:00Z" }));
const boundsFor = (n: number) => worldBounds(layoutTower(sessions(n), vp).tower.y, vp);

describe("clampCamera", () => {
  it("si todo cabe no hay scroll: el suelo se queda abajo", () => {
    const b = boundsFor(2);
    expect(clampCamera({ x: 0, y: 300, zoom: 1 }, b, vp)).toEqual({ x: 0, y: 0, zoom: 1 });
  });

  it("con 40 sesiones se puede subir hasta ver el tejado y no más", () => {
    const b = boundsFor(40);
    expect(b.top).toBeLessThan(0);
    const start = clampCamera({ x: 0, y: 0, zoom: 1 }, b, vp);
    expect(start.y).toBe(0); // arranca viendo el suelo
    const top = clampCamera(scrollBy(start, -1e6), b, vp);
    expect(top.y).toBe(-b.top); // el borde superior del mundo en y=0 de pantalla
    expect(clampCamera(scrollBy(start, 1e6), b, vp).y).toBe(0); // no baja del suelo
  });

  it("zoom limitado entre 0,5 y 2", () => {
    const b = boundsFor(40);
    expect(clampCamera({ x: 0, y: 0, zoom: 10 }, b, vp).zoom).toBe(ZOOM_MAX);
    expect(clampCamera({ x: 0, y: 0, zoom: 0.1 }, b, vp).zoom).toBe(ZOOM_MIN);
  });

  it("alejado, la torre queda centrada en horizontal", () => {
    const c = clampCamera({ x: 123, y: 0, zoom: 0.5 }, boundsFor(2), vp);
    expect(c.x).toBe(250);
  });
});

describe("zoomAt", () => {
  it("mantiene fijo el punto bajo el cursor", () => {
    const cam = { x: 10, y: -40, zoom: 1 };
    const world = { x: (300 - cam.x) / cam.zoom, y: (200 - cam.y) / cam.zoom };
    const z = zoomAt(cam, 1.5, 300, 200);
    expect(z.x + z.zoom * world.x).toBeCloseTo(300);
    expect(z.y + z.zoom * world.y).toBeCloseTo(200);
  });

  it("rueda hacia arriba acerca y hacia abajo aleja", () => {
    expect(wheelZoomFactor(-100)).toBeGreaterThan(1);
    expect(wheelZoomFactor(100)).toBeLessThan(1);
    expect(wheelZoomFactor(100) * wheelZoomFactor(-100)).toBeCloseTo(1);
  });
});
