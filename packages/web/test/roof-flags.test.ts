import { describe, expect, it } from "vitest";
import { stateFlags } from "../src/world/WorldUI.ts";

describe("stateFlags", () => {
  it("cuenta por estado, de lo urgente a lo tranquilo, y omite los vacíos", () => {
    const s = (state: "trabajando" | "te_necesita" | "para_revisar" | "dormida") => ({ state });
    expect(stateFlags([s("dormida"), s("trabajando"), s("te_necesita"), s("trabajando")]).map((f) => [f.state, f.count])).toEqual([
      ["te_necesita", 1],
      ["trabajando", 2],
      ["dormida", 1],
    ]);
    expect(stateFlags([])).toEqual([]);
  });
});
