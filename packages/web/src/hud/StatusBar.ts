import { Container, Graphics, Text } from "pixi.js";
import type { Session } from "@ciudad/shared";
import { iconPixels, STATE_STYLE } from "../tower/layout.ts";
import { formatTokens, STATES, summarize } from "./summary.ts";

export const BAR_H = 32;
/** Hueco a la derecha para el botón de avisos y el buscador (HTML, en index.html). */
export const SEARCH_W = 460;
const C = { panelBg: "#141826", panelText: "#E6E8EF", chipBg: "#1E2230" };
const FONT = "JetBrains Mono, ui-monospace, monospace";

/** Barra fija arriba: un chip por estado (icono, número y etiqueta) y los tokens totales. */
export class StatusBar {
  readonly root = new Container();
  private signature = "";

  update(sessions: Session[], width: number): void {
    const { counts, tokens } = summarize(sessions);
    // Solo se redibuja si cambia algo visible: cada mensaje del WebSocket llama aquí.
    const signature = `${width}|${STATES.map((s) => counts[s]).join(",")}|${formatTokens(tokens)}`;
    if (signature === this.signature) return;
    this.signature = signature;
    for (const child of this.root.removeChildren()) child.destroy({ children: true });
    this.root.addChild(new Graphics().rect(0, 0, width, BAR_H).fill(C.panelBg));

    let x = 8;
    for (const state of STATES) {
      const st = STATE_STYLE[state];
      const label = new Text({
        text: width < 900 ? `${counts[state]}` : `${counts[state]} ${st.label.toLowerCase()}`,
        style: { fontFamily: FONT, fontSize: 11, fill: C.panelText, fontWeight: "bold" },
      });
      const w = 30 + Math.ceil(label.width) + 8;
      const chip = new Graphics().rect(x, 4, w, BAR_H - 8).fill(C.chipBg);
      for (const [px, py] of iconPixels(st.icon)) chip.rect(x + 8 + px * 2, 9 + py * 2, 2, 2).fill(st.color);
      label.position.set(x + 30, 9);
      this.root.addChild(chip, label);
      x += w + 6;
    }

    const tok = new Text({
      text: `tokens ${formatTokens(tokens)}`,
      style: { fontFamily: FONT, fontSize: 11, fill: C.panelText, fontWeight: "bold" },
    });
    tok.anchor.set(1, 0);
    tok.position.set(Math.max(x + Math.ceil(tok.width), width - (width <= 1100 ? 0 : SEARCH_W) - 12), 9);
    this.root.addChild(tok);
  }
}
