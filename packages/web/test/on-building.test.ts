import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { onBuilding } from "../src/panel/model.ts";
import { layoutCity } from "../src/tower/city.ts";

const s: Session = { id: "a", title: "A", floor: 0, projectFloor: 0, state: "trabajando", lastEventAt: "", cwd: "/demo/a" };
const cam = { x: 0, y: 0, zoom: 1 };

describe("clic fuera del edificio", () => {
  it("fachada, placa y lateral cuentan como edificio; cielo y calle no", () => {
    const l = layoutCity([s], { width: 800, height: 600 });
    const b = l.buildings[0];
    expect(onBuilding(l, cam, b.x + 10, b.y + 10)).toBe(true);
    expect(onBuilding(l, cam, b.x + 10, b.y - 20)).toBe(true);
    expect(onBuilding(l, cam, b.x + b.w + 10, b.y + 40)).toBe(true);
    expect(onBuilding(l, cam, b.x - 30, b.y + 10)).toBe(false);
    expect(onBuilding(l, cam, b.x + 10, b.y - 100)).toBe(false);
    expect(onBuilding(l, cam, b.x + 10, l.groundY + 5)).toBe(false);
  });
});
