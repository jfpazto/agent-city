import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { formatUsd, panelModel, relativeTime, sessionAt, subagentsLabel } from "../src/panel/model.ts";
import { contextLevel, layoutTower } from "../src/tower/layout.ts";

const NOW = new Date("2026-10-19T12:00:00Z");
const full: Session = {
  id: "s1",
  title: "Mi sesión",
  cwd: "/tmp/proyecto",
  state: "te_necesita",
  floor: 1,
  lastEventAt: "2026-10-19T11:48:00Z",
  model: "claude-opus-5-5",
  tokens: { input: 110, output: 29_437, cacheRead: 7_556_865, cacheCreation: 126_695 },
  costUsd: 2.734028,
  tools: { commands: 31, reads: 2, web: 0 },
  editedFiles: ["/tmp/proyecto/a.ts", "/tmp/proyecto/b.ts"],
};

describe("contexto y avería", () => {
  const base: Session = { id: "x", title: "t", state: "dormida", floor: 0, lastEventAt: NOW.toISOString() };
  it("filas del panel", () => {
    const rows = Object.fromEntries(panelModel({ ...base, contextPercent: 72, failure: { kind: "rate_limit", at: NOW.toISOString() } }, NOW).rows);
    expect(rows["Contexto"]).toBe("72 % usado");
    expect(rows["Avería"]).toMatch(/^límite de uso \(/);
    const empty = Object.fromEntries(panelModel(base, NOW).rows);
    expect([empty["Contexto"], empty["Avería"]]).toEqual(["—", "—"]);
  });
  it("niveles del indicador: 70 % aviso, 85 % crítico", () => {
    expect([contextLevel(69), contextLevel(70), contextLevel(84), contextLevel(85)]).toEqual(["ok", "aviso", "aviso", "critico"]);
  });
});

describe("subagentsLabel", () => {
  const base: Session = { id: "x", title: "t", state: "trabajando", floor: 0, lastEventAt: NOW.toISOString() };
  it("activos y total; sin dato, raya", () => {
    expect(subagentsLabel(base)).toBe("—");
    expect(subagentsLabel({ ...base, subagentsTotal: 5 })).toBe("5");
    expect(subagentsLabel({ ...base, subagentsActive: 2, subagentsTotal: 5 })).toBe("2 trabajando · 5 en total");
    // El transcript del subagente aún no existe: el total nunca baja de los activos.
    expect(subagentsLabel({ ...base, subagentsActive: 1, subagentsTotal: 0 })).toBe("1 trabajando · 1 en total");
  });
});

describe("panelModel", () => {
  it("sesión con todas las métricas", () => {
    const m = panelModel(full, NOW);
    expect(m).toMatchObject({ title: "Mi sesión", stateLabel: "TE NECESITA", stateColor: "#E5484D", model: "claude-opus-5-5", lastActivity: "hace 12 min", cwd: "/tmp/proyecto" });
    expect(Object.fromEntries(m.rows)).toMatchObject({
      "Coste estimado": "2,73 $",
      Tokens: "7,71 M (7.713.107)",
      "· salida": "29.437",
      Comandos: "31",
      Lecturas: "2",
      "Acciones web": "0",
      "Archivos editados": "2",
    });
    expect(m.files).toEqual(["/tmp/proyecto/a.ts", "/tmp/proyecto/b.ts"]);
  });

  it("sesión sin métricas: guiones, sin inventar ceros", () => {
    const m = panelModel({ id: "x", title: "nueva", state: "trabajando", floor: 0, lastEventAt: NOW.toISOString() }, NOW);
    expect(m.model).toBe("—");
    expect(m.rows.every(([, v]) => v === "—")).toBe(true);
    expect(m.files).toEqual([]);
  });
});

describe("formatos", () => {
  it("formatUsd", () => {
    expect(formatUsd(undefined)).toBe("—");
    expect(formatUsd(0)).toBe("0,00 $");
    expect(formatUsd(0.004)).toBe("< 0,01 $");
    expect(formatUsd(1234.5)).toBe("1234,50 $");
  });

  it("relativeTime", () => {
    expect(relativeTime("2026-10-19T11:59:30Z", NOW)).toBe("hace 30 s");
    expect(relativeTime("2026-10-19T09:00:00Z", NOW)).toBe("hace 3 h");
    expect(relativeTime("2026-10-17T12:00:00Z", NOW)).toBe("hace 2 d");
  });
});

describe("sessionAt", () => {
  const vp = { width: 1000, height: 600 };
  const l = layoutTower([full, { ...full, id: "s0", floor: 0 }], vp);
  const c1 = l.cells[1];

  it("clic dentro de un piso de sesión, con cámara movida y zoom", () => {
    const cam = { x: 30, y: -50, zoom: 2 };
    expect(sessionAt(l, cam, cam.x + 2 * (c1.x + 5), cam.y + 2 * (c1.y + 5))).toBe("s1");
  });

  it("EN VENTA o fuera de la torre: null", () => {
    const cam = { x: 0, y: 0, zoom: 1 };
    const sale = l.cells[3];
    expect(sale.kind).toBe("for_sale");
    expect(sessionAt(l, cam, sale.x + 5, sale.y + 5)).toBeNull();
    expect(sessionAt(l, cam, 1, 1)).toBeNull();
  });
});

import { chartBars, logLines, sessionClipboardText } from "../src/panel/model.ts";

describe("gráfico semanal", () => {
  it("altura relativa al máximo y día de la semana", () => {
    const b = chartBars([
      { day: "2026-10-18", tokens: 50 },
      { day: "2026-10-19", tokens: 200 },
    ]);
    expect(b.map((x) => [x.label, x.pct])).toEqual([["do", 25], ["lu", 100]]);
  });
  it("sin actividad: todo a 0", () => {
    expect(chartBars([{ day: "2026-10-19", tokens: 0 }])[0].pct).toBe(0);
  });
});

describe("bitácora en el panel", () => {
  it("más reciente primero, con hora relativa y ×N", () => {
    const lines = logLines(
      [
        { at: "2026-10-19T11:00:00Z", label: "Leyendo código", count: 3 },
        { at: "2026-10-19T11:58:00Z", label: "Ejecutando comandos", count: 1 },
      ],
      NOW,
    );
    expect(lines).toEqual(["hace 2 min · Ejecutando comandos", "hace 1 h · Leyendo código ×3"]);
    expect(logLines(undefined, NOW)).toEqual([]);
  });
});

describe("Abrir sesión sin deep link", () => {
  it("copia título, carpeta e id", () => {
    expect(sessionClipboardText({ id: "abc", title: "Mi sesión", cwd: "/tmp/p" })).toBe("Mi sesión\n/tmp/p\nsesión abc");
  });
});
