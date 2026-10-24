import type { Session } from "@ciudad/shared";
import { chartBars, formatTokensExact, localDayKey, logLines, panelModel, QUICK_REPLIES, sessionClipboardText } from "./model.ts";

/**
 * Panel de detalle (HTML, a la derecha, por encima de la torre). Todo el texto va por textContent:
 * títulos y rutas vienen de los transcripts.
 */
export class DetailPanel {
  private el = document.querySelector<HTMLElement>("#panel")!;
  private returnFocus: HTMLElement | null = null;
  openId: string | null = null;

  private sessions: Session[] = [];
  private toastTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(private onClose: () => void) {
    this.el.querySelector("#panel-close")!.addEventListener("click", () => this.close());
    // Respuestas rápidas: se copian, nunca se envían a la sesión.
    const replies = this.el.querySelector("#panel-replies")!;
    for (const text of QUICK_REPLIES) {
      const b = document.createElement("button");
      b.type = "button";
      b.textContent = text;
      b.addEventListener("click", () => void this.copy(text, `Copiado: «${text}»`));
      replies.append(b);
    }
    const area = this.el.querySelector<HTMLTextAreaElement>("#panel-reply")!;
    this.el.querySelector("#panel-reply-copy")!.addEventListener("click", () => {
      const text = area.value.trim();
      if (!text) return this.toast("Escribe algo antes de copiar");
      void this.copy(text, "Copiada tu respuesta");
    });
    this.el.querySelector("#panel-open")!.addEventListener("click", () => {
      const s = this.sessions.find((x) => x.id === this.openId);
      if (s) void this.copy(sessionClipboardText(s), "Copiados título y carpeta: búscala en la app");
    });
    this.el.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        this.close();
      }
    });
  }

  private async copy(text: string, ok: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(text);
      return this.toast(ok);
    } catch {
      // Algunos navegadores (o vistas incrustadas) no dan la API asíncrona: se prueba el método clásico.
    }
    const back = document.activeElement as HTMLElement | null;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.cssText = "position:fixed;top:-1000px;opacity:0";
    document.body.append(ta);
    ta.select();
    const done = document.execCommand("copy");
    ta.remove();
    back?.focus?.();
    this.toast(done ? ok : "No se pudo copiar: el navegador no dio acceso al portapapeles");
  }

  private toast(text: string): void {
    const t = this.el.querySelector<HTMLElement>("#panel-toast")!;
    t.textContent = text;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (t.textContent = ""), 3000);
  }

  open(id: string, sessions: Session[]): void {
    if (!this.openId) this.returnFocus = document.activeElement as HTMLElement | null;
    this.openId = id;
    this.el.hidden = false;
    this.update(sessions);
    this.el.querySelector<HTMLElement>("#panel-close")!.focus();
  }

  close(restoreFocus = true): void {
    if (!this.openId) return;
    this.openId = null;
    this.el.hidden = true;
    if (restoreFocus) this.returnFocus?.focus?.();
    this.returnFocus = null;
    this.onClose();
  }

  /** Repinta con los datos en vivo; si la sesión desaparece, se cierra. */
  update(sessions: Session[], now = new Date()): void {
    this.sessions = sessions;
    if (!this.openId) return;
    const s = sessions.find((x) => x.id === this.openId);
    if (!s) return this.close();
    const m = panelModel(s, now);
    const $ = (sel: string) => this.el.querySelector<HTMLElement>(sel)!;
    $("#panel-title").textContent = m.title;
    $("#panel-state").textContent = m.stateLabel;
    $("#panel-state").style.setProperty("--state", m.stateColor);
    $("#panel-model").textContent = m.model;
    $("#panel-activity").textContent = m.lastActivity;
    $("#panel-cwd").textContent = m.cwd;
    $("#panel-cwd").title = m.cwd;
    $("#panel-project").textContent = m.projectName;
    $("#panel-project").title = m.projectRoot;

    $("#panel-rows").replaceChildren(
      ...m.rows.flatMap(([k, v]) => {
        const dt = document.createElement("dt");
        dt.textContent = k;
        const dd = document.createElement("dd");
        dd.textContent = v;
        return [dt, dd];
      }),
    );
    $("#panel-files").replaceChildren(
      ...m.files.map((f) => {
        const li = document.createElement("li");
        li.textContent = f;
        li.title = f;
        return li;
      }),
    );
    $("#panel-files-empty").hidden = m.files.length > 0;

    const today = localDayKey(now);
    const bars = chartBars(s.daily ?? []);
    $("#panel-chart").replaceChildren(
      ...bars.map((b) => {
        const col = document.createElement("div");
        col.className = b.day === today ? "bar today" : "bar";
        col.title = `${b.day}: ${formatTokensExact(b.tokens)} tokens`;
        const bar = document.createElement("i");
        bar.style.height = `${b.pct}%`;
        const label = document.createElement("span");
        // Hoy no se distingue solo por el color: la etiqueta dice «hoy».
        label.textContent = b.day === today ? "hoy" : b.label;
        col.append(bar, label);
        return col;
      }),
    );
    $("#panel-chart").setAttribute(
      "aria-description",
      bars.length
        ? bars.map((b) => `${b.day === today ? "hoy" : b.label} ${formatTokensExact(b.tokens)}`).join(", ")
        : "sin datos",
    );

    const lines = logLines(s.log, now);
    $("#panel-log").replaceChildren(
      ...lines.map((l) => {
        const li = document.createElement("li");
        li.textContent = l;
        return li;
      }),
    );
    $("#panel-log-empty").hidden = lines.length > 0;
  }
}
