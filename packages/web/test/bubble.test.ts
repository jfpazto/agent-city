import { describe, expect, it } from "vitest";
import { BUBBLE_CHARS, bubbleFor, wrapText } from "../src/tower/layout.ts";

describe("wrapText", () => {
  it("texto corto: una línea", () => {
    expect(wrapText("Necesita permiso")).toEqual(["Necesita permiso"]);
  });

  it("parte por palabras en dos líneas", () => {
    const l = wrapText("Claude necesita tu permiso para usar Bash");
    expect(l).toHaveLength(2);
    expect(l.every((x) => [...x].length <= BUBBLE_CHARS)).toBe(true);
    expect(l.join(" ")).toBe("Claude necesita tu permiso para usar Bash");
  });

  it("si no cabe, la segunda línea acaba en …", () => {
    const l = wrapText("uno dos tres cuatro cinco seis siete ocho nueve diez once doce trece catorce");
    expect(l).toHaveLength(2);
    expect(l[1].endsWith("…")).toBe(true);
    expect([...l[1]].length).toBeLessThanOrEqual(BUBBLE_CHARS);
  });

  it("palabras más largas que la línea se cortan", () => {
    const l = wrapText("x".repeat(60));
    expect(l).toHaveLength(2);
    expect(l.every((x) => [...x].length <= BUBBLE_CHARS)).toBe(true);
  });
});

describe("bubbleFor", () => {
  it("solo en te_necesita con mensaje", () => {
    expect(bubbleFor({ state: "te_necesita", lastMessage: "Hola" })).toEqual(["Hola"]);
    expect(bubbleFor({ state: "te_necesita" })).toBeNull();
    expect(bubbleFor({ state: "te_necesita", lastMessage: "  " })).toBeNull();
    expect(bubbleFor({ state: "trabajando", lastMessage: "Hola" })).toBeNull();
  });
});
