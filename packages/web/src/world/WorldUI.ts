import type { SessionState } from "@ciudad/shared";
import type { Camera } from "../tower/camera.ts";
import { STATE_STYLE } from "../tower/layout.ts";
import { addRelation, relationKey, type MapBuilding, type Rect, type Relation, type WorldLayout } from "./model.ts";
import { facilityRect, usageShortText, usageSummary, type UsageView } from "./usage.ts";

export type WorldActions = {
  focus(provider: "all" | "claude" | "codex"): void;
  enter(id: string): void;
  session(id: string): void;
  back(): void;
  zoom(factor: number): void;
  setRelations(relations: Relation[]): boolean;
  setMotion(enabled: boolean): void;
};

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const countLabel = (n: number) => `${n} ${n === 1 ? "sesión" : "sesiones"}`;

/** Banderas del rótulo, de lo más urgente a lo más tranquilo. */
const FLAGS = [
  { state: "te_necesita", text: "aprobación" },
  { state: "trabajando", text: "trabajando" },
  { state: "para_revisar", text: "finalizada(s)" },
  { state: "dormida", text: "dormida(s)" },
] as const;

/** Cuenta de sesiones por estado de un edificio, solo las que tienen alguna. */
export function stateFlags(sessions: { state: SessionState }[]): { state: SessionState; count: number; text: string }[] {
  return FLAGS.map((f) => ({ ...f, count: sessions.filter((s) => s.state === f.state).length })).filter((f) => f.count > 0);
}

/** Controles HTML y nombres de edificios accesibles. Nunca inserta texto de sesión como HTML. */
export class WorldUI {
  readonly toolbar = $<HTMLElement>("city-nav");
  private labels = $<HTMLElement>("map-labels");
  private picker = $<HTMLSelectElement>("city-picker");
  private dialog = $<HTMLElement>("city-relations");
  private from = $<HTMLSelectElement>("bridge-from");
  private to = $<HTMLSelectElement>("bridge-to");
  private buttons = new Map<string, HTMLButtonElement>();
  private world: WorldLayout | null = null;
  private relations: Relation[] = [];
  private current: MapBuilding | null = null;
  private optionsSignature = "";
  private bridgeSignature = "";
  private motion = true;
  private floorSignature = "";
  private usageLabels = new Map<string, { el: HTMLElement; text: HTMLElement; hidden: HTMLElement }>();
  private usageViews: UsageView[] = [];

  constructor(private actions: WorldActions) {
    this.toolbar.querySelectorAll<HTMLButtonElement>("[data-district]").forEach((button) => {
      button.addEventListener("click", () => actions.focus(button.dataset.district as "all" | "claude" | "codex"));
    });
    $("back-map").addEventListener("click", actions.back);
    $("city-zoom-in").addEventListener("click", () => actions.zoom(1.25));
    $("city-zoom-out").addEventListener("click", () => actions.zoom(0.8));
    this.picker.addEventListener("change", () => { if (this.picker.value) actions.enter(this.picker.value); });
    $<HTMLSelectElement>("floor-picker").addEventListener("change", (e) => {
      const value = (e.currentTarget as HTMLSelectElement).value;
      if (value) actions.session(value);
    });
    $("bridges-open").addEventListener("click", () => this.toggleBridges());
    $("bridges-close").addEventListener("click", () => this.closeBridges());
    this.dialog.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); this.closeBridges(); } });
    $("bridge-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const next = addRelation(this.relations, this.from.value, this.to.value);
      if (next === this.relations) return this.announce("Elige dos proyectos diferentes que aún no tengan un puente.");
      const saved = this.actions.setRelations(next);
      this.announce(saved ? "Puente creado" : "Puente creado para esta pestaña; el navegador no permitió guardarlo.");
    });
    $("city-motion").addEventListener("click", () => actions.setMotion(!this.motion));
  }

  announce(message: string): void { $("city-announcement").textContent = message; }
  closeBridges(): void {
    this.dialog.hidden = true;
    $("bridges-open").setAttribute("aria-expanded", "false");
    $("bridges-open").focus();
  }
  get bridgesOpen(): boolean { return !this.dialog.hidden; }
  private toggleBridges(): void {
    if (!this.dialog.hidden) return this.closeBridges();
    this.dialog.hidden = false;
    $("bridges-open").setAttribute("aria-expanded", "true");
    if (this.current) this.from.value = this.current.project.id;
    this.from.focus();
  }

  update(world: WorldLayout, selected: string | null, district: string, relations: Relation[], motion: boolean, reduced: boolean, selectedSession: string | null): void {
    this.world = world;
    this.relations = relations;
    this.current = world.buildings.find((b) => b.id === selected) ?? null;
    this.motion = motion;
    this.labels.hidden = !!this.current;
    $("back-map").hidden = !this.current;
    const floorPicker = $<HTMLSelectElement>("floor-picker");
    floorPicker.hidden = !this.current;
    const floorSignature = JSON.stringify([this.current?.id, this.current?.sessions.map((s) => [s.id, s.title, s.state])]);
    if (floorSignature !== this.floorSignature) {
      this.floorSignature = floorSignature;
      floorPicker.replaceChildren(new Option("Abrir una sesión…", ""), ...(this.current?.sessions ?? []).map((s) => new Option(`${s.title} · ${STATE_STYLE[s.state].label.toLowerCase()}`, s.id)));
    }
    floorPicker.value = selectedSession ?? "";
    $("city-context").textContent = this.current ? `${this.current.provider === "claude" ? "Claude" : "Codex"} / ${this.current.project.name}` : "Vista superior";
    this.toolbar.querySelectorAll<HTMLButtonElement>("[data-district]").forEach((b) => b.setAttribute("aria-pressed", String(!selected && district === b.dataset.district)));
    $("city-motion").textContent = reduced ? "Movimiento reducido" : motion ? "Vida: sí" : "Vida: no";
    $("city-motion").setAttribute("aria-pressed", String(motion && !reduced));
    $<HTMLButtonElement>("city-motion").disabled = reduced;
    $("bridges-open").textContent = `Puentes (${world.bridges.length})`;

    const signature = JSON.stringify(world.buildings.map((b) => [b.id, b.label, b.project.root]));
    if (signature !== this.optionsSignature) {
      this.optionsSignature = signature;
      const currentPicker = this.picker.value;
      this.picker.replaceChildren(new Option("Ir a un proyecto…", ""), ...world.buildings.map((b) => new Option(`${b.provider === "claude" ? "Claude" : "Codex"} · ${b.label}`, b.id)));
      this.picker.value = currentPicker;
      const projects = [...new Map(world.buildings.map((b) => [b.project.id, b.project])).values()];
      const a = this.from.value, b = this.to.value;
      for (const select of [this.from, this.to]) {
        select.replaceChildren(new Option("Elige un proyecto…", ""), ...projects.map((p) => new Option(
          projects.some((q) => q.id !== p.id && q.name === p.name) ? `${p.name} · ${p.root ?? p.id}` : p.name, p.id)));
      }
      this.from.value = a;
      this.to.value = b;
    }
    this.picker.value = selected ?? "";
    const ids = new Set(world.buildings.map((b) => b.id));
    for (const [id, button] of this.buttons) if (!ids.has(id)) { button.remove(); this.buttons.delete(id); }
    for (const b of world.buildings) {
      let button = this.buttons.get(b.id);
      if (!button) {
        button = document.createElement("button");
        button.type = "button";
        button.className = "roof-label";
        const name = document.createElement("strong"), summary = document.createElement("span");
        name.className = "roof-name";
        summary.className = "roof-summary";
        const smoke = document.createElement("b");
        smoke.className = "roof-smoke";
        smoke.setAttribute("aria-hidden", "true");
        smoke.append(document.createElement("i"), document.createElement("i"), document.createElement("i"));
        // Cartel de «listo para revisar»: ✓ amarillo que flota sobre la azotea.
        const ready = document.createElement("b");
        ready.className = "roof-ready";
        ready.setAttribute("aria-hidden", "true");
        ready.textContent = "✓";
        button.append(smoke, ready, name, summary);
        button.addEventListener("click", () => this.actions.enter(b.id));
        this.labels.append(button);
        this.buttons.set(b.id, button);
      }
      button.dataset.provider = b.provider;
      button.style.setProperty("--roof-state", STATE_STYLE[b.state].color);
      button.querySelector("strong")!.textContent = b.label;
      const flags = stateFlags(b.sessions);
      const summary = button.querySelector(".roof-summary")!;
      summary.replaceChildren(...flags.map((f) => {
        const flag = document.createElement("i");
        flag.className = "roof-flag";
        flag.dataset.state = f.state;
        flag.textContent = String(f.count);
        flag.title = `${f.count} ${f.text}`;
        return flag;
      }));
      // Humo: alguna sesión está trabajando. Cartel ✓: alguna ya respondió y espera revisión.
      button.classList.toggle("has-smoke", flags.some((f) => f.state === "trabajando"));
      button.classList.toggle("has-ready", flags.some((f) => f.state === "para_revisar"));
      const detail = flags.map((f) => `${f.count} ${f.text}`).join(", ");
      button.setAttribute("aria-label", `Entrar a ${b.label}, barrio ${b.provider === "claude" ? "Claude" : "Codex"}, ${countLabel(b.sessions.length)}: ${detail}`);
      button.title = `${b.project.name}\n${b.project.root ?? ""}\n${detail}`;
    }
    this.updateBridgeList();
  }

  /** Rótulos del depósito y la central: texto visible corto y la frase completa para lectores de pantalla. */
  setUsage(views: UsageView[]): void {
    this.usageViews = views;
    for (const v of views) {
      if (this.usageLabels.has(v.provider)) continue;
      const el = document.createElement("p"), text = document.createElement("span"), hidden = document.createElement("span");
      el.className = "usage-label";
      el.dataset.provider = v.provider;
      text.setAttribute("aria-hidden", "true");
      hidden.className = "sr-only";
      el.append(text, hidden);
      this.labels.append(el);
      this.usageLabels.set(v.provider, { el, text, hidden });
    }
  }

  private positionUsage(camera: Camera, viewport: Rect): void {
    const now = new Date(), distant = camera.zoom < 0.6;
    for (const [provider, label] of this.usageLabels) {
      const v = this.usageViews.find((x) => x.provider === provider), d = this.world?.districts.find((x) => x.provider === provider);
      if (!v || !d) { label.el.hidden = true; continue; }
      const r = facilityRect(d);
      const x = camera.x + (r.x - 6) * camera.zoom, y = camera.y + (r.y + r.h / 2) * camera.zoom;
      const summary = usageSummary(v, now);
      label.text.textContent = usageShortText(v, now, distant);
      label.hidden.textContent = summary;
      label.el.title = summary;
      label.el.dataset.state = v.fiveHour.state;
      label.el.style.left = `${Math.round(x)}px`;
      label.el.style.top = `${Math.round(y)}px`;
      label.el.hidden = x < 0 || x > window.innerWidth + 200 || y < viewport.y || y > viewport.y + viewport.h;
    }
  }

  positionLabels(camera: Camera, viewport: Rect, highlighted: string | null): void {
    if (!this.world || this.labels.hidden) return;
    this.positionUsage(camera, viewport);
    const bottom = Math.max(0, window.innerHeight - viewport.y - viewport.h);
    this.labels.style.clipPath = `inset(${Math.max(0, viewport.y - 4)}px 0 ${bottom}px 0)`;
    for (const b of this.world.buildings) {
      const button = this.buttons.get(b.id)!;
      const x = camera.x + (b.x + b.w / 2) * camera.zoom;
      const y = camera.y + (b.y + b.h + 48) * camera.zoom;
      const distant = camera.zoom < 0.28;
      button.classList.toggle("is-distant", distant);
      button.classList.toggle("is-highlighted", b.id === highlighted);
      button.style.left = `${Math.round(x)}px`;
      button.style.top = `${Math.round(y)}px`;
      button.style.width = `${distant ? 34 : Math.max(66, Math.min(136, 250 * camera.zoom - 10))}px`;
      button.hidden = x < -80 || x > window.innerWidth + 80 || y < viewport.y - 30 || y > viewport.y + viewport.h + 30;
    }
  }

  focusBuilding(id: string): void {
    const button = this.buttons.get(id), box = button?.getBoundingClientRect();
    if (button && !button.hidden && box && box.left >= 0 && box.right <= window.innerWidth) button.focus({ preventScroll: true });
    else this.picker.focus({ preventScroll: true });
  }

  private updateBridgeList(): void {
    if (!this.world) return;
    const signature = JSON.stringify([this.relations, this.world.bridges.map((b) => [b.id, b.kind]), this.world.buildings.map((b) => [b.project.id, b.project.name])]);
    if (signature === this.bridgeSignature) return;
    this.bridgeSignature = signature;
    const names = new Map(this.world.buildings.map((b) => [b.project.id, b.project.name]));
    const auto = this.world.bridges.filter((b) => b.kind === "same-project");
    $("automatic-bridges").textContent = auto.length ? auto.map((bridge) => {
      const b = this.world!.buildings.find((b) => b.id === bridge.from)!;
      return `${b.project.name}: Claude ↔ Codex`;
    }).join(" · ") : "Sin proyectos compartidos entre barrios por ahora.";
    const list = $("manual-bridges");
    list.replaceChildren();
    for (const r of this.relations) {
      const li = document.createElement("li"), text = document.createElement("span"), remove = document.createElement("button");
      text.textContent = `${names.get(r.from) ?? "Proyecto sin sesiones"} ↔ ${names.get(r.to) ?? "Proyecto sin sesiones"}`;
      remove.type = "button";
      remove.textContent = "Quitar";
      remove.setAttribute("aria-label", `Quitar puente ${text.textContent}`);
      remove.addEventListener("click", () => {
        this.actions.setRelations(this.relations.filter((other) => relationKey(other.from, other.to) !== relationKey(r.from, r.to)));
        this.announce("Puente quitado");
        $("bridges-close").focus();
      });
      li.append(text, remove);
      list.append(li);
    }
    $("manual-bridges-empty").hidden = this.relations.length > 0;
  }
}
