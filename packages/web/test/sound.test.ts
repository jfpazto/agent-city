import { describe, expect, it } from "vitest";
import { chimeNotes, soundButtonText } from "../src/urgent/sound.ts";

describe("sonido de avisos", () => {
  it("el rojo sube y el ya respondió baja", () => {
    const [a, b] = chimeNotes("urgent");
    expect(b.freq).toBeGreaterThan(a.freq);
    const [c, d] = chimeNotes("finished");
    expect(d.freq).toBeLessThan(c.freq);
  });

  it("texto del botón", () => {
    expect(soundButtonText(true)).toBe("Sonido: sí");
    expect(soundButtonText(false)).toBe("Sonido: no");
  });
});
