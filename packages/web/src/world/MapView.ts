import { Container, Graphics, Text } from "pixi.js";
import { STATE_STYLE } from "../tower/layout.ts";
import { LOT_H, LOT_W, ROAD, ROOF_DEPTH, pennantColors, pointOnPath, type District, type Point, type WorldLayout } from "./model.ts";
import { facilityRect, type UsageView, type WindowView } from "./usage.ts";

const FONT = "JetBrains Mono, ui-monospace, monospace";
type Traveler = { sprite: Graphics; path: Point[]; period: number; offset: number };

/** Color del nivel: normal por proveedor, ámbar si queda poco, rojo si se agotó, gris sin dato. */
const levelColor = (w: WindowView, normal: string) =>
  w.state === "sin_dato" ? "#A3A9A6" : w.state === "agotado" ? "#E5484D" : w.state === "bajo" ? "#E5A54B" : normal;

/** Escena estática y pequeños sprites móviles separados: los frames no reconstruyen la ciudad. */
export class MapView {
  readonly root = new Container();
  private travelers: Traveler[] = [];
  private beacons: Graphics[] = [];
  private headers: Array<{ title: Text; subtitle: Text; district: District }> = [];
  /** Depósito (Claude) y central (Codex): capa propia, se redibuja sin reconstruir la ciudad. */
  private usage = new Container();
  private drips: Array<{ sprite: Graphics; x: number; y: number }> = [];
  private steam: Array<{ sprite: Graphics; x: number; y: number; strength: number }> = [];

  update(world: WorldLayout, highlighted: string | null): void {
    for (const child of this.root.removeChildren()) if (child !== this.usage) child.destroy({ children: true });
    this.travelers = [];
    this.beacons = [];
    this.headers = [];
    const g = new Graphics();
    this.root.addChild(g);
    const rect = (x: number, y: number, w: number, h: number, color: string) => g.rect(x, y, w, h).fill(color);
    const tree = (x: number, y: number) => {
      rect(x + 4, y + 10, 5, 12, "#81755D");
      rect(x, y, 18, 17, "#6D9774");
      rect(x + 3, y - 3, 12, 7, "#87AD83");
      rect(x + 7, y + 2, 8, 8, "#A4C396");
    };
    const road = (x: number, y: number, w: number, h: number, vertical: boolean) => {
      rect(x, y, w, h, "#647587");
      const extent = vertical ? h : w;
      for (let offset = 12; offset < extent - 12; offset += 44) {
        rect(x + (vertical ? w / 2 - 1 : offset), y + (vertical ? offset : h / 2 - 1), vertical ? 2 : 22, vertical ? 22 : 2, "#C5D0CF");
      }
    };

    rect(0, 0, world.bounds.w, world.bounds.h, "#AEC5A2");
    const avenueX = world.districts[0].x + world.districts[0].w + 20;
    road(avenueX, 0, 44, world.bounds.h, true);
    road(0, world.bounds.h - 42, world.bounds.w, 42, false);

    for (const d of world.districts) {
      const warm = d.provider === "claude";
      rect(d.x - 8, d.y - 8, d.w + 16, d.h + 16, "#C4CEB9");
      rect(d.x, d.y, d.w, d.h, warm ? "#D6C9AD" : "#BFCED1");
      for (let col = 1; col < world.columns; col++) road(d.x + 28 + col * LOT_W + (col - 1) * ROAD, d.y + 64, ROAD, d.h - 64, true);
      for (let row = 1; row < world.rows; row++) road(d.x + 4, d.y + 70 + row * LOT_H + (row - 1) * ROAD, d.w - 8, ROAD, false);
      for (let row = 0; row < world.rows; row++) for (let col = 0; col < world.columns; col++) {
        const x = d.x + 28 + col * (LOT_W + ROAD), y = d.y + 70 + row * (LOT_H + ROAD);
        rect(x - 5, y - 5, LOT_W + 10, LOT_H + 10, "#E2DFCC");
        rect(x, y, LOT_W, LOT_H, "#B6C5A6");
        tree(x + LOT_W - 28, y + 24);
        tree(x + LOT_W - 28, y + 65);
        tree(x + 10, y + LOT_H - 38);
        rect(x + 158, y + 142, 36, 3, "#907F69");
        rect(x + 158, y + 150, 36, 3, "#907F69");
        for (let tile = 0; tile < 5; tile++) rect(x + 11 + tile * 44, y + LOT_H - 10, 22, 3, "#D9DDCE");
      }
      const title = new Text({ text: `BARRIO ${d.provider.toUpperCase()}`, style: { fontFamily: FONT, fontSize: 14, fontWeight: "bold", fill: "#23394B" } });
      const subtitle = new Text({ text: d.count ? `${d.count} proyectos · ${d.sessions} sesiones` : `Sin sesiones de ${warm ? "Claude" : "Codex"}`, style: { fontFamily: FONT, fontSize: 11, fill: "#344E5F" } });
      this.root.addChild(title, subtitle);
      this.headers.push({ title, subtitle, district: d });

      // Tráfico ambiental: no representa ejecuciones ni mensajes reales.
      const carY = d.y + 70 + LOT_H + ROAD / 2;
      const car = new Graphics().rect(-9, -4, 18, 8).fill(warm ? "#DDE2DA" : "#A3BED1").rect(-3, -3, 6, 6).fill("#415B70");
      this.root.addChild(car);
      this.travelers.push({ sprite: car, path: [{ x: d.x + 15, y: carY }, { x: d.x + d.w - 15, y: carY }], period: 22_000, offset: warm ? 0 : 0.45 });
    }

    for (const b of world.buildings) {
      const warm = b.provider === "claude";
      rect(b.x + 10, b.y + 15, b.w + ROOF_DEPTH + 10, b.h + ROOF_DEPTH + 8, "#859581");
      rect(b.x, b.y + ROOF_DEPTH, b.w, b.h, warm ? "#9D866B" : "#7F98A8");
      rect(b.x + b.w, b.y + ROOF_DEPTH, ROOF_DEPTH, b.h, warm ? "#85725F" : "#668296");
      rect(b.x, b.y, b.w, b.h, warm ? "#CCB493" : "#A8C0D3");
      rect(b.x + 5, b.y + 5, b.w - 10, b.h - 10, warm ? "#E8D9BE" : "#DCE7EB");
      rect(b.x + 12, b.y + 12, 28, 24, "#AAB3AD");
      rect(b.x + 15, b.y + 15, 22, 3, "#7E8F90");
      rect(b.x + 15, b.y + 23, 22, 3, "#7E8F90");
      rect(b.x + b.w - 39, b.y + 15, 24, 34, "#778B92");
      for (let row = 0; row < 3; row++) rect(b.x + b.w - 36, b.y + 18 + row * 9, 18, 5, "#455D70");
      const displayed = b.sessions.slice(0, 6);
      displayed.forEach((s, i) => rect(b.x + 10 + i * 18, b.y + b.h + ROOF_DEPTH - 6, 12, 5, STATE_STYLE[s.state].color));
      if (highlighted === b.id) g.rect(b.x - 5, b.y - 5, b.w + ROOF_DEPTH + 10, b.h + ROOF_DEPTH + 10).stroke({ color: "#7968CF", width: 4 });
      if (b.state === "te_necesita") {
        const beacon = new Graphics().rect(0, 0, 14, 14).fill("#E5484D").rect(6, 2, 2, 6).fill("#FFF3EF").rect(6, 10, 2, 2).fill("#FFF3EF");
        beacon.position.set(b.x + b.w - 8, b.y - 8);
        this.root.addChild(beacon);
        this.beacons.push(beacon);
      }
    }

    // Relaciones: un banderín del mismo color en la azotea de cada edificio del grupo, sin líneas por el mapa.
    const pennants = new Graphics();
    this.root.addChild(pennants);
    const colors = pennantColors(world);
    for (const b of world.buildings) {
      const color = colors.get(b.id);
      if (!color) continue;
      const mx = b.x + 50, top = b.y - 14;
      pennants.rect(mx + 2, top + 2, 2, 24).fill("#859581");
      pennants.rect(mx, top, 2, 24).fill("#2B3045");
      // Gallardete pixel: triángulo que apunta a la derecha (7 filas de 2 px: 4, 9, 14, 19, 14, 9 y 4 px).
      for (let i = 0; i < 7; i++) pennants.rect(mx + 2, top + i * 2, 19 - Math.abs(i - 3) * 5, 2).fill(color);
    }
    this.root.addChild(this.usage);
  }

  /** Dibuja el límite de uso de cada barrio. El nivel es lo que queda; sin dato, todo en gris. */
  setUsage(districts: District[], views: UsageView[]): void {
    for (const child of this.usage.removeChildren()) child.destroy({ children: true });
    this.drips = [];
    this.steam = [];
    for (const d of districts) {
      const v = views.find((x) => x.provider === d.provider);
      if (!v) continue;
      const g = new Graphics();
      this.usage.addChild(g);
      const r = facilityRect(d);
      const rect = (x: number, y: number, w: number, h: number, color: string) => g.rect(r.x + x, r.y + y, w, h).fill(color);
      const fill = (w: WindowView) => (w.remaining ?? 0) / 100;
      const five = v.fiveHour, week = v.weekly;
      const off = five.state === "sin_dato" && week.state === "sin_dato";
      // Límite agotado: el barrio queda a media luz hasta la recarga.
      if (five.state === "agotado") g.rect(d.x, d.y + 64, d.w, d.h - 64).fill({ color: "#1B2733", alpha: 0.22 });
      if (d.provider === "claude") {
        // Depósito sobre patas: el agua baja según se gasta la ventana de 5 h.
        rect(6, 36, 4, 18, off ? "#8E918F" : "#6E5E4B");
        rect(34, 36, 4, 18, off ? "#8E918F" : "#6E5E4B");
        rect(0, 2, 44, 36, off ? "#9AA09D" : "#8C7A63");
        rect(3, 5, 38, 30, "#EDE7DA");
        const water = Math.round(30 * fill(five));
        if (water) rect(3, 35 - water, 38, water, levelColor(five, "#5E9CC8"));
        rect(0, 0, 44, 4, off ? "#8E918F" : "#6E5E4B");
        // Embalse semanal, bajo y ancho, a la derecha.
        rect(48, 40, 32, 14, off ? "#9AA09D" : "#8C7A63");
        rect(50, 42, 28, 10, "#EDE7DA");
        const pond = Math.round(28 * fill(week));
        if (pond) rect(50, 42, pond, 10, levelColor(week, "#7FB3D9"));
        if (five.state !== "sin_dato" && (five.remaining ?? 100) < 10) {
          const drip = new Graphics().rect(0, 0, 3, 5).fill("#5E9CC8");
          this.usage.addChild(drip);
          this.drips.push({ sprite: drip, x: r.x + 20, y: r.y + 38 });
          drip.position.set(r.x + 20, r.y + 40);
        }
      } else {
        // Central eléctrica con chimenea y una batería que se descarga con la ventana de 5 h.
        rect(0, 18, 34, 36, off ? "#9AA09D" : "#6A8396");
        rect(4, 24, 8, 6, "#DCE7EB");
        rect(16, 24, 8, 6, "#DCE7EB");
        rect(22, 2, 8, 18, off ? "#8E918F" : "#526A7C");
        rect(46, 4, 10, 4, off ? "#8E918F" : "#2F4152");
        rect(40, 8, 22, 46, off ? "#8E918F" : "#2F4152");
        rect(43, 11, 16, 40, "#E8EDEF");
        const charge = Math.round(40 * fill(five));
        if (charge) rect(43, 51 - charge, 16, charge, levelColor(five, "#6FBF73"));
        // Pilas semanales: cuatro, encendidas según lo que queda.
        const cells = week.remaining === null ? 0 : Math.ceil(week.remaining / 25);
        for (let i = 0; i < 4; i++) {
          rect(66, 44 - i * 12, 12, 10, off ? "#8E918F" : "#2F4152");
          rect(68, 46 - i * 12, 8, 6, i < cells ? levelColor(week, "#6FBF73") : "#E8EDEF");
        }
        if (five.state !== "sin_dato" && five.state !== "recargado") {
          const puff = new Graphics().rect(0, 0, 10, 6).fill("#F2F4F3").rect(4, -5, 8, 6).fill("#E4E8E7");
          this.usage.addChild(puff);
          this.steam.push({ sprite: puff, x: r.x + 22, y: r.y - 4, strength: 1 - fill(five) });
          puff.position.set(r.x + 22, r.y - 4);
          puff.alpha = 0.3 + 0.6 * (1 - fill(five));
        }
      }
    }
  }

  setZoom(zoom: number): void {
    // El rótulo mantiene tamaño en pantalla, pero nunca crece más que la franja de 64 px sobre los solares.
    const compact = zoom < 0.33;
    const scale = Math.min(1 / zoom, compact ? 3 : 2.2);
    for (const { title, subtitle, district } of this.headers) {
      title.style.fontSize = 13 * scale;
      title.text = compact ? district.provider.toUpperCase() : `BARRIO ${district.provider.toUpperCase()}`;
      title.position.set(district.x + 12, district.y + (compact ? 8 : 12 * scale));
      subtitle.style.fontSize = 11 * scale;
      // Subtítulo en la misma línea que el título, alineado por la base, para no invadir los solares.
      subtitle.position.set(title.x + title.width + 10 * scale, title.y + 2 * scale);
      // Deja sitio al rótulo del depósito o la central (unos 80 px en pantalla): encoge el subtítulo y, si no cabe, lo oculta.
      const room = facilityRect(district).x - 80 / zoom - subtitle.x;
      if (subtitle.width > room) subtitle.style.fontSize = 11 * scale * Math.max(0, room) / subtitle.width;
      subtitle.visible = !compact && subtitle.style.fontSize * zoom >= 8;
    }
  }

  tick(ms: number, animated: boolean): void {
    for (const t of this.travelers) {
      const progress = animated ? (ms / t.period + t.offset) % 1 : t.offset % 1;
      const p = pointOnPath(t.path, progress);
      t.sprite.position.set(Math.round(p.x), Math.round(p.y));
    }
    for (const g of this.beacons) g.alpha = animated ? 0.75 + 0.2 * Math.sin(ms / 450) : 1;
    // Goteo del depósito casi vacío y vapor de la central según lo gastado; quietos sin Vida.
    for (const d of this.drips) {
      const k = animated ? (ms / 1_400) % 1 : 0.3;
      d.sprite.position.set(d.x, Math.round(d.y + 2 + k * 14));
      d.sprite.alpha = animated ? 1 - k : 1;
    }
    for (const s of this.steam) {
      const k = animated ? (ms / (2_600 - 1_400 * s.strength)) % 1 : 0;
      s.sprite.position.set(Math.round(s.x + k * 6), Math.round(s.y - k * 10));
      s.sprite.alpha = (0.3 + 0.6 * s.strength) * (animated ? 1 - k : 1);
    }
  }
}
