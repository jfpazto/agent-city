import { Container, Graphics, Text } from "pixi.js";
import { contextLevel, FAILURE_LABEL, FRAME, glowAlpha, iconPixels, STATE_STYLE, truncate, type FloorCell, type Viewport } from "./layout.ts";
import { BUILDING_LABEL_H, layoutCity, sessionProject, type CityLayout } from "./city.ts";
import { OPEN_BUTTON } from "../panel/model.ts";
import { layoutScenery, wrapX, type Scenery } from "./scenery.ts";
import type { Session, SessionFailure, SessionState } from "@ciudad/shared";

// Colores de DESIGN.md.
const C = {
  ground: "#B7C2B3",
  towerFrame: "#1E2230",
  shaft: "#141826",
  floorEmpty: "#E8E4DA",
  floorDark: "#2B3045",
  panelBg: "#141826",
  panelText: "#E6E8EF",
  accent: "#8B7CF6",
  // Avería y contexto crítico: naranja, distinto del rojo de «te necesita».
  failure: "#F06B1F",
};
const FONT = "JetBrains Mono, ui-monospace, monospace";
const HELPERS_MAX = 3;

/** Dibuja la ciudad: un edificio por proyecto/agente y un piso por sesión. */
export class TowerView {
  readonly root = new Container();
  /** Capas fijas: decorado detrás, pisos y lo que pasa por delante (peatones y coches). */
  private back = new Container();
  private cells = new Container();
  private front = new Container();
  /** Dónde añaden los métodos de decorado (detrás o delante de los pisos). */
  private layer: Container = this.back;
  /** El decorado solo se rehace si cambia la geometría; cada piso, solo si cambia lo que dibuja. */
  private staticKey = "";
  private cellCache = new Map<string, { c: Container; glows: TowerView["glows"]; workers: TowerView["workers"] }>();
  private glows: Array<{ g: Graphics; state: SessionState }> = [];
  private projectOrder: string[] = [];
  private workers: Array<{ g: Graphics; active: boolean; phase: number }> = [];
  private movers: Array<{ g: Graphics; x0: number; speed: number; bob: boolean }> = [];
  private worldWidth = 0;
  /** Contenedor de cada piso con sesión y su x de reposo (para deslizarlo). */
  private cellViews = new Map<string, { c: Container; x: number; cell: FloorCell; trash?: Graphics }>();

  /** Solo cambia la opacidad de las capas de brillo (parpadeo de te_necesita). */
  tick(ms: number, animated = true): void {
    for (const { g, state } of this.glows) g.alpha = glowAlpha(state, animated ? ms : 0);
    for (const worker of this.workers) worker.g.y = animated && worker.active ? Math.round(Math.sin(ms / 350 + worker.phase)) : 0;
    // Nubes, peatones y coches avanzan solo con movimiento activado; quietos se quedan en su sitio inicial.
    for (const m of this.movers) {
      m.g.x = animated ? Math.round(wrapX(m.x0, m.speed, ms, this.worldWidth)) : m.x0;
      m.g.y = animated && m.bob ? Math.round(Math.abs(Math.sin(ms / 160 + m.x0))) * -1 : 0;
    }
  }

  constructor() {
    this.root.addChild(this.back, this.cells, this.front);
  }

  /** Piso resaltado (buscador): marco del color de acento. */
  highlightId: string | null = null;

  /** Redibuja lo que cambió y devuelve la disposición (para la cámara y el buscador). */
  update(sessions: Session[], viewport: Viewport, singleBuilding = false): CityLayout {
    if (!sessions.length) this.projectOrder = [];
    for (const s of sessions) {
      const id = sessionProject(s).id;
      if (!this.projectOrder.includes(id)) this.projectOrder.push(id);
    }
    const source = singleBuilding ? sessions.map((s) => ({ ...s, project: { ...sessionProject(s), order: 0 } })) : sessions;
    const l = layoutCity(source, viewport, singleBuilding ? undefined : this.projectOrder);

    const staticKey = JSON.stringify([l.worldWidth, l.groundY, viewport, l.buildings.map((b) => [b.x, b.y, b.w, b.h, b.label])]);
    if (staticKey !== this.staticKey) {
      this.staticKey = staticKey;
      this.drawStatic(l, viewport);
    }

    // Pisos: se reutiliza el contenedor de cada piso cuyo dibujo no cambió; los demás se crean y los sobrantes se destruyen.
    for (const v of this.cellViews.values()) if (v.trash) { v.trash.destroy({ children: true, context: true }); v.trash = undefined; }
    this.cells.removeChildren();
    this.cellViews.clear();
    this.glows = [];
    this.workers = [];
    const next = new Map<string, { c: Container; glows: TowerView["glows"]; workers: TowerView["workers"] }>();
    for (const cell of l.cells) {
      const key = `${JSON.stringify(cell)}|${cell.kind === "session" && cell.id === this.highlightId}`;
      let entry = this.cellCache.get(key);
      if (entry) this.cellCache.delete(key);
      else {
        const g0 = this.glows.length, w0 = this.workers.length;
        const c = this.drawCell(cell);
        entry = { c, glows: this.glows.splice(g0), workers: this.workers.splice(w0) };
      }
      next.set(key, entry);
      this.glows.push(...entry.glows);
      this.workers.push(...entry.workers);
      this.cells.addChild(entry.c);
      if (cell.kind === "session") this.cellViews.set(cell.id, { c: entry.c, x: cell.x, cell });
    }
    for (const old of this.cellCache.values()) old.c.destroy({ children: true, context: true });
    this.cellCache = next;
    return l;
  }

  /** Decorado: fondo, suelo, edificios con su rótulo, mobiliario urbano (detrás) y tráfico (delante). */
  private drawStatic(l: CityLayout, viewport: Viewport): void {
    for (const layer of [this.back, this.front]) for (const child of layer.removeChildren()) child.destroy({ children: true, context: true });
    this.movers = [];
    this.worldWidth = l.worldWidth;
    const scenery = layoutScenery(l.worldWidth, l.groundY, l.buildings.map((b) => ({ x: b.x, w: b.w })));
    this.layer = this.back;
    this.drawBackdrop(scenery, l.groundY);

    const g = new Graphics();
    g.rect(0, l.groundY, l.worldWidth, viewport.height - l.groundY).fill(C.ground);
    g.rect(0, l.groundY + 20, l.worldWidth, Math.max(0, viewport.height - l.groundY - 20)).fill("#617186");
    this.back.addChild(g);

    for (const building of l.buildings) {
      const depth = 28, roofY = building.y - BUILDING_LABEL_H;
      // Fachada lateral, azotea y sombra dura: volumen sin perder la lectura frontal de los pisos.
      g.poly([building.x + building.w, roofY, building.x + building.w + depth, roofY - 18, building.x + building.w + depth, l.groundY - 18, building.x + building.w, l.groundY]).fill("#827C72");
      g.poly([building.x, roofY, building.x + depth, roofY - 18, building.x + building.w + depth, roofY - 18, building.x + building.w, roofY]).fill("#DED6C2");
      g.rect(building.x, building.y, building.w, building.h).fill(C.towerFrame);
      g.rect(building.x, building.y - BUILDING_LABEL_H, building.w, BUILDING_LABEL_H).fill(C.panelBg);
      g.rect(building.x, building.y - BUILDING_LABEL_H, building.w, FRAME).fill(C.accent);
      const label = new Text({ text: truncate(building.label, 30), style: { fontFamily: FONT, fontSize: 12, fontWeight: "bold", fill: C.panelText } });
      // El nombre completo queda en el buscador y el panel; la placa nunca invade otro edificio.
      label.scale.set(Math.min(1, (building.w - 16) / Math.max(1, label.width)));
      label.position.set(building.x + 8, building.y - BUILDING_LABEL_H + 12);
      this.back.addChild(label);
      // El nombre sigue visible al pie cuando hay tantas sesiones que la azotea queda fuera de pantalla.
      const streetLabel = new Text({ text: truncate(building.label, 30), style: { fontFamily: FONT, fontSize: 11, fill: "#25394D" } });
      streetLabel.position.set(building.x + 8, l.groundY + 8);
      this.back.addChild(streetLabel);
    }
    if (!l.buildings.length) {
      const empty = new Text({ text: "Aún no hay proyectos", style: { fontFamily: FONT, fontSize: 16, fill: C.panelBg } });
      empty.anchor.set(0.5);
      empty.position.set(viewport.width / 2, l.groundY - 100);
      this.back.addChild(empty);
    }

    this.drawStreetProps(scenery, l.groundY);
    this.layer = this.front;
    this.drawMovers(scenery, l.groundY);
  }

  /** Fondo: sol, skyline lejano con ventanas encendidas y nubes que pasan. */
  private drawBackdrop(sc: Scenery, groundY: number): void {
    const back = new Graphics();
    back.rect(this.worldWidth - 150, groundY - 520, 44, 44).fill("#FCE7A6").rect(this.worldWidth - 154, groundY - 512, 52, 28).fill("#FCE7A6");
    for (const b of sc.skyline) {
      back.rect(b.x, groundY - b.h, b.w, b.h).fill(b.color);
      back.rect(b.x, groundY - b.h, b.w, 4).fill("#D3E2F0");
      for (const [wx, wy] of b.windows) back.rect(b.x + wx, groundY - b.h + wy, 6, 8).fill("#F4E3A1");
    }
    this.layer.addChild(back);
    for (const cloud of sc.clouds) {
      const c = new Graphics().rect(0, 8, cloud.w, 12).fill("#F4F8FC").rect(10, 0, cloud.w * 0.5, 10).fill("#F4F8FC").rect(cloud.w * 0.45, 3, cloud.w * 0.35, 8).fill("#F4F8FC");
      c.x = cloud.x;
      const layer = new Container();
      layer.y = cloud.y;
      layer.addChild(c);
      this.layer.addChild(layer);
      this.movers.push({ g: c, x0: cloud.x, speed: cloud.speed, bob: false });
    }
  }

  /** Árboles, farolas y bancos sobre la acera, a los lados de los edificios. */
  private drawStreetProps(sc: Scenery, groundY: number): void {
    const p = new Graphics();
    for (const x of sc.trees) {
      p.rect(x + 11, groundY - 22, 6, 24).fill("#6B4F3A");
      p.rect(x, groundY - 52, 28, 22).fill("#4E8F55").rect(x + 4, groundY - 60, 20, 10).fill("#5FA866").rect(x + 6, groundY - 46, 6, 4).fill("#79BE7E");
    }
    for (const x of sc.lamps) {
      p.rect(x + 12, groundY - 56, 4, 58).fill("#2B3045").rect(x + 6, groundY - 60, 16, 6).fill("#2B3045").rect(x + 8, groundY - 54, 12, 4).fill("#F5C542");
    }
    for (const x of sc.benches) {
      p.rect(x, groundY - 14, 34, 4).fill("#9A6B44").rect(x, groundY - 22, 34, 4).fill("#9A6B44").rect(x + 2, groundY - 10, 4, 10).fill("#2B3045").rect(x + 28, groundY - 10, 4, 10).fill("#2B3045");
    }
    this.layer.addChild(p);
  }

  /** Peatones por la acera y coches por la calzada. */
  private drawMovers(sc: Scenery, groundY: number): void {
    for (const w of sc.walkers) {
      const g = new Graphics().rect(2, 0, 6, 6).fill("#DEB594").rect(0, 6, 10, 9).fill(w.shirt).rect(1, 15, 3, 6).fill("#233349").rect(6, 15, 3, 6).fill("#233349");
      const layer = new Container();
      layer.y = groundY - 9;
      layer.addChild(g);
      this.layer.addChild(layer);
      this.movers.push({ g, x0: w.x, speed: w.speed, bob: true });
    }
    for (const car of sc.cars) {
      const g = new Graphics().rect(0, 6, 44, 10).fill(car.color).rect(8, 0, 26, 8).fill(car.color).rect(11, 2, 9, 5).fill("#BFE0F5").rect(23, 2, 9, 5).fill("#BFE0F5")
        .rect(5, 14, 8, 6).fill("#141826").rect(31, 14, 8, 6).fill("#141826");
      const layer = new Container();
      layer.y = groundY + 24;
      layer.addChild(g);
      this.layer.addChild(layer);
      this.movers.push({ g, x0: car.x, speed: car.speed, bob: false });
    }
  }

  private drawCell(cell: FloorCell): Container {
    const c = new Container();
    c.position.set(cell.x, cell.y);
    const g = new Graphics();
    c.addChild(g);

    if (cell.kind === "for_sale") {
      g.rect(0, 0, cell.w, cell.h).fill(C.floorEmpty);
      const sign = { w: 92, h: 24 };
      const sx = Math.round((cell.w - sign.w) / 2);
      const sy = Math.round((cell.h - sign.h) / 2);
      g.rect(sx, sy - 8, sign.w, sign.h).fill(C.panelBg);
      const t = new Text({ text: "EN VENTA", style: { fontFamily: FONT, fontSize: 12, fill: C.panelText, fontWeight: "bold" } });
      t.anchor.set(0.5);
      t.position.set(Math.round(cell.w / 2), Math.round(cell.h / 2) - 8);
      // Pista: el piso libre abre una sesión nueva en este proyecto.
      const hint = new Text({ text: "+ clic: nueva sesión", style: { fontFamily: FONT, fontSize: 10, fill: C.panelBg } });
      hint.anchor.set(0.5);
      hint.position.set(Math.round(cell.w / 2), Math.round(cell.h / 2) + 18);
      c.addChild(t, hint);
      return c;
    }

    const st = STATE_STYLE[cell.state];
    g.rect(0, 0, cell.w, cell.h).fill(C.floorDark);
    const glow = new Graphics().rect(0, 0, cell.w, cell.h).fill(st.color);
    glow.alpha = glowAlpha(cell.state, performance.now());
    this.glows.push({ g: glow, state: cell.state });
    c.addChild(glow);

    const plate = new Graphics().rect(8, 8, 32, 32).fill(C.accent);
    const ini = new Text({ text: cell.initials, style: { fontFamily: FONT, fontSize: 12, fill: "#FFFFFF", fontWeight: "bold" } });
    ini.anchor.set(0.5);
    ini.position.set(24, 24);

    // Chip de estado: icono pixel en el color del estado y etiqueta (el estado no depende solo del color).
    const chip = new Graphics().rect(46, 8, cell.w - 58 - OPEN_BUTTON.w, 22).fill(C.panelBg);
    for (const [x, y] of iconPixels(st.icon)) chip.rect(51 + x * 2, 12 + y * 2, 2, 2).fill(st.color);
    const label = new Text({ text: st.label, style: { fontFamily: FONT, fontSize: 10, fill: C.panelText, fontWeight: "bold" } });
    label.position.set(70, 12);

    const titleBg = new Graphics().rect(4, cell.h - 26, cell.w - 8, 20).fill({ color: C.panelBg, alpha: 0.75 });
    const title = new Text({ text: cell.title, style: { fontFamily: FONT, fontSize: 12, fill: C.panelText } });
    title.position.set(8, cell.h - 23);
    // Botón ▶: abre la conversación en la app de Claude o en Terminal (el resto del piso abre el panel).
    const bx = cell.w - OPEN_BUTTON.right - OPEN_BUTTON.w;
    const open = new Graphics().rect(bx, OPEN_BUTTON.top, OPEN_BUTTON.w, OPEN_BUTTON.h).fill(C.accent);
    for (let i = 0; i < 5; i++) open.rect(bx + 10 + i * 2, OPEN_BUTTON.top + 6 + i, 2, 10 - i * 2).fill("#FFFFFF");
    c.addChild(plate, ini, chip, label, titleBg, title, open);
    if (cell.context !== undefined) this.drawContext(c, cell.context);
    if (cell.bubble) c.addChild(this.drawBubble(cell.bubble, cell.w));
    else if (cell.failure) c.addChild(this.drawFailure(cell.failure, cell.w));
    else {
      const desk = new Graphics().rect(58, 59, cell.w - 80, 4).fill("#B1A18A").rect(64, 63, 4, 6).fill("#7F8997").rect(cell.w - 32, 63, 4, 6).fill("#7F8997")
        .rect(120, 37, 30, 21).fill("#172B40").rect(123, 40, 24, 14).fill(st.color).rect(133, 58, 4, 4).fill("#BDCBD6");
      const worker = new Graphics().rect(83, 40, 8, 8).fill("#DEB594").rect(80, 48, 14, 12).fill("#91A0C5").rect(82, 60, 4, 8).fill("#233349").rect(90, 60, 4, 8).fill("#233349");
      c.addChild(desk, worker);
      this.workers.push({ g: worker, active: cell.state === "trabajando", phase: cell.floor });
      this.drawHelpers(c, cell);
    }
    if (cell.id === this.highlightId) {
      // Marco de 4 px en el color de acento, por fuera del contenido del piso.
      const hl = new Graphics();
      hl.rect(-FRAME, -FRAME, cell.w + FRAME * 2, FRAME).fill(C.accent);
      hl.rect(-FRAME, cell.h, cell.w + FRAME * 2, FRAME).fill(C.accent);
      hl.rect(-FRAME, 0, FRAME, cell.h).fill(C.accent);
      hl.rect(cell.w, 0, FRAME, cell.h).fill(C.accent);
      c.addChild(hl);
    }
    return c;
  }

  /**
   * Desliza un piso a la derecha (gesto de eliminar). Detrás aparece una franja roja que pasa a «Suelta para
   * eliminar» al superar el umbral. `dx` 0 lo devuelve a su sitio.
   */
  slide(id: string, dx: number, threshold: number): void {
    const v = this.cellViews.get(id);
    if (!v) return;
    const offset = Math.max(0, Math.min(dx, v.cell.w));
    v.c.x = v.x + offset;
    if (v.trash) { v.trash.destroy({ children: true, context: true }); v.trash = undefined; }
    if (offset <= 0) return;
    const ready = offset >= threshold;
    const trash = new Graphics().rect(0, 0, offset, v.cell.h).fill(ready ? "#E5484D" : "#8E3B3F");
    trash.position.set(v.x, v.cell.y);
    const label = new Text({ text: ready ? "Suelta: eliminar" : "Eliminar →", style: { fontFamily: FONT, fontSize: 11, fill: "#FFFFFF", fontWeight: "bold" } });
    label.position.set(6, Math.round(v.cell.h / 2) - 7);
    label.visible = offset > label.width + 10;
    trash.addChild(label);
    this.cells.addChildAt(trash, this.cells.getChildIndex(v.c));
    v.trash = trash;
  }

  /** Cartel de avería en lugar de la mesa: franja de obra y el tipo de error (el estado sigue en el chip). */
  private drawFailure(kind: SessionFailure["kind"], w: number): Container {
    const b = new Container();
    const g = new Graphics().rect(46, 36, w - 52, 24).fill(C.towerFrame);
    for (let i = 0; i < 4; i++) g.rect(48 + i * 4, 38, 2, 20).fill(i % 2 ? "#141826" : C.failure);
    g.rect(48, 38, 16, 20).fill({ color: C.failure, alpha: 0.35 });
    const t = new Text({ text: `AVERÍA · ${FAILURE_LABEL[kind]}`, style: { fontFamily: FONT, fontSize: 10, fill: C.panelText, fontWeight: "bold" } });
    t.position.set(70, 42);
    b.addChild(g, t);
    return b;
  }

  /** Indicador de contexto bajo la placa: barra y porcentaje; ámbar desde el 70 % y naranja con «!» desde el 85 %. */
  private drawContext(c: Container, percent: number): void {
    const level = contextLevel(percent);
    const color = level === "critico" ? C.failure : level === "aviso" ? "#E9A23B" : "#7F8997";
    // Placa oscura: se lee igual sobre cualquier color de estado.
    const g = new Graphics().rect(8, 44, 32, 20).fill(C.panelBg).rect(10, 46, Math.round((28 * percent) / 100), 4).fill(color);
    const t = new Text({ text: `${percent}%${level === "critico" ? "!" : ""}`, style: { fontFamily: FONT, fontSize: 9, fill: level === "ok" ? C.panelText : color, fontWeight: "bold" } });
    t.position.set(10, 51);
    c.addChild(g, t);
  }

  /**
   * Subagentes trabajando: un ayudante pequeño (camiseta de acento) por cada uno a la derecha del monitor,
   * hasta 3; si hay más, «+N». Se mueven con el personaje principal.
   */
  private drawHelpers(c: Container, cell: FloorCell & { kind: "session" }): void {
    const n = cell.helpers ?? 0;
    for (let i = 0; i < Math.min(n, HELPERS_MAX); i++) {
      const h = new Graphics().rect(2, 0, 6, 6).fill("#DEB594").rect(0, 6, 10, 8).fill(C.accent).rect(1, 14, 3, 5).fill("#233349").rect(6, 14, 3, 5).fill("#233349");
      h.x = 158 + i * 14;
      const layer = new Container();
      layer.y = 40;
      layer.addChild(h);
      c.addChild(layer);
      this.workers.push({ g: h, active: true, phase: cell.floor + i + 1 });
    }
    if (n > HELPERS_MAX) {
      const more = new Text({ text: `+${n - HELPERS_MAX}`, style: { fontFamily: FONT, fontSize: 10, fill: C.panelText, fontWeight: "bold" } });
      more.position.set(158 + HELPERS_MAX * 14, 44);
      c.addChild(more);
    }
  }

  /** Bocadillo con el último mensaje, entre el chip y el título; el pico apunta al chip de estado. */
  private drawBubble(lines: string[], w: number): Container {
    const b = new Container();
    const g = new Graphics();
    const h = 8 + lines.length * 12;
    const y = 36;
    g.rect(46, y, w - 52, h).fill(C.towerFrame);
    g.rect(48, y + 2, w - 56, h - 4).fill(C.floorEmpty);
    // Pico pixel hacia arriba, bajo el icono del chip.
    g.rect(50, y - 4, 8, 4).fill(C.towerFrame);
    g.rect(52, y - 2, 4, 4).fill(C.floorEmpty);
    b.addChild(g);
    lines.forEach((line, i) => {
      const t = new Text({ text: line, style: { fontFamily: FONT, fontSize: 10, fill: C.panelBg } });
      t.position.set(52, y + 4 + i * 12);
      b.addChild(t);
    });
    return b;
  }
}
