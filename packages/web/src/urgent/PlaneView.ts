import { Container, Graphics, Text } from "pixi.js";
import { FLIGHT_MS, planeX } from "./urgent.ts";

// DESIGN.md: avioneta y pancarta pixel art, en coordenadas de pantalla bajo la barra.
const C = { body: "#E6E8EF", wing: "#8B7CF6", dark: "#1E2230", window: "#7FB2E5", banner: "#E6E8EF", text: "#141826", rope: "#1E2230", needs: "#E5484D" };
const FONT = "JetBrains Mono, ui-monospace, monospace";
const P = 3; // tamaño del píxel de la avioneta
const PLANE_W = 16 * P;
const ROPE = 24;
const BANNER_Y = 60;

/** Avioneta que cruza el cielo con la pancarta de lo urgente; repite mientras haya texto. */
export class PlaneView {
  readonly root = new Container();
  private readonly plane = new Graphics();
  private readonly rope = new Graphics();
  private readonly banner = new Container();
  private readonly bannerBg = new Graphics();
  private readonly label = new Text({ text: "", style: { fontFamily: FONT, fontSize: 12, fill: C.text, fontWeight: "bold" } });
  private start: number | null = null;
  private text = "";

  constructor() {
    this.drawPlane();
    this.label.position.set(10, 6);
    this.banner.addChild(this.bannerBg, this.label);
    this.root.addChild(this.rope, this.banner, this.plane);
    this.root.visible = false;
  }

  /** Texto de la pancarta; vacío = sin urgentes (la pasada en curso se corta). */
  setText(text: string): void {
    this.text = text;
    if (!text) {
      this.start = null;
      this.root.visible = false;
    }
  }

  /** ¿El punto de pantalla cae en la pancarta? El clic lo gestiona main.ts, como el de los pisos. */
  hitsBanner(x: number, y: number): boolean {
    if (!this.root.visible) return false;
    const b = this.banner.getBounds();
    return x >= b.x && x <= b.x + b.width && y >= b.y && y <= b.y + b.height;
  }

  tick(ms: number, viewportW: number, animated = true): void {
    if (!this.text) return;
    if (this.start === null) this.start = ms;
    if (this.label.text !== this.text) {
      this.label.text = this.text;
      const w = Math.ceil(this.label.width) + 20;
      this.bannerBg.clear().rect(0, 0, w, 28).fill(C.dark).rect(2, 2, w - 4, 24).fill(C.banner).rect(2, 2, 4, 24).fill(C.needs);
    }
    const bannerW = this.bannerBg.width;
    const total = PLANE_W + ROPE + bannerW;
    const x = animated ? planeX(ms - this.start, viewportW, total) : viewportW - 12;
    if (x === null) {
      this.start = ms; // otra pasada mientras siga habiendo urgentes
      return;
    }
    this.root.visible = true;
    const bob = animated ? Math.round(Math.sin(ms / 400) * 2) : 0;
    this.plane.position.set(x - PLANE_W, BANNER_Y - 6 + bob);
    this.banner.position.set(x - PLANE_W - ROPE - bannerW, BANNER_Y);
    this.rope.clear().rect(x - PLANE_W - ROPE, BANNER_Y + 13, ROPE, 2).fill(C.rope);
  }

  /** Avioneta de 16×10 píxeles mirando a la derecha. */
  private drawPlane(): void {
    const g = this.plane;
    const px = (x: number, y: number, w: number, h: number, c: string) => g.rect(x * P, y * P, w * P, h * P).fill(c);
    px(1, 3, 2, 4, C.wing); // cola
    px(0, 2, 2, 2, C.wing);
    px(2, 5, 12, 3, C.body); // fuselaje
    px(3, 4, 10, 1, C.body);
    px(9, 4, 3, 1, C.window); // cabina
    px(14, 5, 1, 3, C.dark); // morro
    px(15, 3, 1, 7, C.dark); // hélice
    px(6, 8, 5, 1, C.wing); // ala
    px(7, 9, 3, 1, C.dark);
    px(2, 7, 12, 1, C.dark); // panza
  }
}
