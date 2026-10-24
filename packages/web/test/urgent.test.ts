import { describe, expect, it } from "vitest";
import type { Session, SessionState } from "@ciudad/shared";
import { emptyTracker, trackRed, urgentSessions, urgentThreshold, URGENT_MS } from "../src/urgent/urgent.ts";

const T0 = Date.parse("2026-10-19T10:00:00Z");
const s = (id: string, state: SessionState, lastEventAt = "2026-10-19T09:00:00Z", floor = 0): Session => ({ id, title: id, floor, state, lastEventAt });

describe("urgentes", () => {
  it("transición vista: 59 s no, 61 s sí", () => {
    let t = trackRed(emptyTracker(), [s("a", "trabajando")], T0 - 5_000);
    t = trackRed(t, [s("a", "te_necesita")], T0);
    expect(t.redSince.get("a")).toBe(T0);
    expect(urgentSessions([s("a", "te_necesita")], t, T0 + 59_000)).toEqual([]);
    expect(urgentSessions([s("a", "te_necesita")], t, T0 + 61_000).map((x) => x.id)).toEqual(["a"]);
  });

  it("snapshot inicial: usa lastEventAt", () => {
    const t = trackRed(emptyTracker(), [s("a", "te_necesita", "2026-10-19T09:58:00Z")], T0);
    expect(t.redSince.get("a")).toBe(Date.parse("2026-10-19T09:58:00Z"));
    expect(urgentSessions([s("a", "te_necesita")], t, T0)).toHaveLength(1);
  });

  it("lastEventAt inválido o futuro: ahora", () => {
    expect(trackRed(emptyTracker(), [s("a", "te_necesita", "x")], T0).redSince.get("a")).toBe(T0);
    expect(trackRed(emptyTracker(), [s("a", "te_necesita", "2030-01-01T00:00:00Z")], T0).redSince.get("a")).toBe(T0);
  });

  it("otro evento sin salir de rojo no reinicia", () => {
    let t = trackRed(emptyTracker(), [s("a", "dormida")], T0);
    t = trackRed(t, [s("a", "te_necesita")], T0);
    t = trackRed(t, [s("a", "te_necesita", "2026-10-19T10:00:30Z")], T0 + 30_000);
    expect(t.redSince.get("a")).toBe(T0);
  });

  it("sale de rojo y vuelve: episodio nuevo", () => {
    let t = trackRed(emptyTracker(), [s("a", "te_necesita", "2026-10-19T09:00:00Z")], T0);
    t = trackRed(t, [s("a", "trabajando")], T0 + 1_000);
    expect(urgentSessions([s("a", "trabajando")], t, T0 + 2_000)).toEqual([]);
    t = trackRed(t, [s("a", "te_necesita")], T0 + 10_000);
    expect(t.redSince.get("a")).toBe(T0 + 10_000);
    expect(urgentSessions([s("a", "te_necesita")], t, T0 + 69_000)).toEqual([]);
  });

  it("orden: la que más lleva en rojo primero", () => {
    const list = [s("a", "te_necesita", "2026-10-19T09:58:00Z", 0), s("b", "te_necesita", "2026-10-19T09:50:00Z", 1), s("c", "trabajando")];
    const t = trackRed(emptyTracker(), list, T0);
    expect(urgentSessions(list, t, T0).map((x) => x.id)).toEqual(["b", "a"]);
  });

  it("umbral: 60 s fuera de desarrollo", () => {
    expect(urgentThreshold("?urgentMs=5000", false)).toBe(URGENT_MS);
    expect(urgentThreshold("?urgentMs=5000", true)).toBe(5000);
    expect(urgentThreshold("", true)).toBe(URGENT_MS);
  });
});

import { bannerText, FLIGHT_MS, planeX } from "../src/urgent/urgent.ts";

describe("pancarta y avioneta", () => {
  it("texto en singular y plural, con el título del primero", () => {
    expect(bannerText([])).toBe("");
    expect(bannerText([s("Revisar PR", "te_necesita")])).toBe("1 te necesita: Revisar PR");
    expect(bannerText([s("Revisar PR", "te_necesita"), s("b", "te_necesita")])).toBe("2 te necesitan: Revisar PR…");
    expect(bannerText([s("x".repeat(40), "te_necesita")])).toBe(`1 te necesita: ${"x".repeat(31)}…`);
  });

  it("cruza de izquierda a derecha y termina", () => {
    expect(planeX(0, 1000, 300)).toBe(0);
    expect(planeX(FLIGHT_MS / 2, 1000, 300)).toBe(650);
    expect(planeX(FLIGHT_MS, 1000, 300)).toBe(1300);
    expect(planeX(FLIGHT_MS + 1, 1000, 300)).toBeNull();
  });
});
