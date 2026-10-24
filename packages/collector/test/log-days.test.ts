import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { actionLabel, createTokenAccumulator, feedLines, lastDays, localDay, pushLog } from "../src/transcript.ts";

const DAYS = path.join(import.meta.dirname, "fixtures", "transcript-days.jsonl");
const load = async () => {
  const acc = createTokenAccumulator();
  feedLines(acc, await fs.readFile(DAYS, "utf8"));
  return acc;
};
const day = (iso: string) => localDay(new Date(iso));

describe("bitácora", () => {
  it("etiquetas por tipo de herramienta, sin contenido", () => {
    expect(actionLabel("Bash")).toBe("Ejecutando comandos");
    expect(actionLabel("Grep")).toBe("Leyendo código");
    expect(actionLabel("Write")).toBe("Escribiendo código");
    expect(actionLabel("WebSearch")).toBe("Buscando en la web");
    expect(actionLabel("Agent")).toBe("Delegando en un subagente");
    expect(actionLabel("mcp__Claude_Browser__navigate")).toBe("Usando herramientas externas");
    expect(actionLabel("Skill")).toBe("Usando Skill");
  });

  it("agrupa repeticiones seguidas y se queda con las últimas", () => {
    const log: { at: string; label: string; count: number }[] = [];
    pushLog(log, "2026-10-19T10:00:00Z", "A", 3);
    pushLog(log, "2026-10-19T10:01:00Z", "A", 3);
    pushLog(log, "2026-10-19T10:02:00Z", "B", 3);
    pushLog(log, "2026-10-19T10:03:00Z", "C", 3);
    pushLog(log, "2026-10-19T10:04:00Z", "D", 3);
    expect(log.map((e) => `${e.label}${e.count}`)).toEqual(["B1", "C1", "D1"]);
    const g: typeof log = [];
    pushLog(g, "2026-10-19T10:00:00Z", "A");
    pushLog(g, "2026-10-19T10:05:00Z", "A");
    expect(g).toEqual([{ at: "2026-10-19T10:05:00Z", label: "A", count: 2 }]);
  });

  it("desde el fixture: encargo, lecturas agrupadas, comando, escritura y externas; sin mensajes internos", async () => {
    const acc = await load();
    expect(acc.log.map((e) => [e.label, e.count])).toEqual([
      ["Recibió un encargo", 1],
      ["Leyendo código", 2],
      ["Ejecutando comandos", 1],
      ["Escribiendo código", 1],
      ["Usando herramientas externas", 1],
    ]);
    expect(acc.log[1].at).toBe("2026-10-14T12:02:00Z");
  });
});

describe("tokens por día", () => {
  it("cada mensaje cuenta una vez en su día local", async () => {
    const acc = await load();
    expect(acc.byDay[day("2026-10-14T12:01:00Z")]).toBe(150);
    expect(acc.byDay[day("2026-10-16T12:03:00Z")]).toBe(1015);
    expect(acc.byDay[day("2026-10-19T12:00:00Z")]).toBe(6);
    expect(acc.byDay[day("2026-10-12T12:00:00Z")]).toBe(7);
  });

  it("últimos 7 días, del más antiguo a hoy, con ceros donde no hubo actividad", async () => {
    const acc = await load();
    const now = new Date("2026-10-19T12:00:00Z");
    const w = lastDays(acc.byDay, now);
    expect(w).toHaveLength(7);
    expect(w[6]).toEqual({ day: localDay(now), tokens: 6 });
    expect(w.map((d) => d.tokens)).toEqual([0, 150, 0, 1015, 0, 0, 6]); // el 12 queda fuera
  });
});
