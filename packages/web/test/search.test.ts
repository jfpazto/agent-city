import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { matchSessions, nextMatch, normalize } from "../src/hud/search.ts";
import { centerOn } from "../src/tower/camera.ts";

const s = (id: string, title: string, floor: number): Session => ({ id, title, floor, state: "dormida", lastEventAt: "2026-10-19T10:00:00Z" });
const sessions = [s("c", "Revisión de PR", 4), s("a", "frontagentico", 0), s("b", "Front: panel", 2)];

describe("buscador", () => {
  it("sin mayúsculas ni tildes", () => {
    expect(normalize("  Revisión ÁRBOL ")).toBe("revision arbol");
    expect(matchSessions(sessions, "revision")).toEqual(["c"]);
  });

  it("fragmento del título, de la planta más baja a la más alta", () => {
    expect(matchSessions(sessions, "FRONT")).toEqual(["a", "b"]);
  });

  it("vacío o sin coincidencias: ninguno", () => {
    expect(matchSessions(sessions, "  ")).toEqual([]);
    expect(matchSessions(sessions, "zzz")).toEqual([]);
  });

  it("Intro da la vuelta", () => {
    expect(nextMatch(["a", "b"], null)).toBe("a");
    expect(nextMatch(["a", "b"], "a")).toBe("b");
    expect(nextMatch(["a", "b"], "b")).toBe("a");
    expect(nextMatch(["a", "b"], "x")).toBe("a");
    expect(nextMatch([], "a")).toBeNull();
  });
});

describe("centerOn", () => {
  it("deja el piso en el centro de la pantalla", () => {
    const cam = centerOn({ x: 0, y: 0, zoom: 2 }, { x: 100, y: -500, w: 180, h: 96 }, { width: 1000, height: 600 });
    expect(cam.x + 2 * (100 + 90)).toBe(500);
    expect(cam.y + 2 * (-500 + 48)).toBe(300);
    expect(cam.zoom).toBe(2);
  });
});
