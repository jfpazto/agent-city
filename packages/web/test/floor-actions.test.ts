import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { forSaleAt, isSwipe } from "../src/panel/model.ts";
import { layoutCity } from "../src/tower/city.ts";

describe("acciones de piso", () => {
  it("deslizar solo cuenta si va a la derecha y más horizontal que vertical", () => {
    expect(isSwipe(60, 5)).toBe(true);
    expect(isSwipe(-60, 5)).toBe(false);
    expect(isSwipe(30, 40)).toBe(false);
    expect(isSwipe(4, 0)).toBe(false);
  });

  it("el piso libre de arriba se detecta; un piso con sesión no", () => {
    const s: Session = { id: "a", title: "A", floor: 0, projectFloor: 0, state: "dormida", lastEventAt: "", cwd: "/demo/a" };
    const l = layoutCity([s], { width: 800, height: 600 });
    const cam = { x: 0, y: 0, zoom: 1 };
    const free = l.cells.find((c) => c.kind === "for_sale")!;
    const busy = l.cells.find((c) => c.kind === "session")!;
    expect(forSaleAt(l, cam, free.x + 5, free.y + 5)).toBe(true);
    expect(forSaleAt(l, cam, busy.x + 5, busy.y + 5)).toBe(false);
  });
});
