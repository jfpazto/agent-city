import type { Session } from "@ciudad/shared";

/**
 * Qué urgentes hay que avisar: los que no se avisaron en este episodio. `notified` se
 * queda solo con los urgentes actuales, así que salir de rojo y volver avisa otra vez.
 */
export function decideNotify(notified: ReadonlySet<string>, urgent: Session[]): { notify: Session[]; notified: Set<string> } {
  return { notify: urgent.filter((s) => !notified.has(s.id)), notified: new Set(urgent.map((s) => s.id)) };
}

/** Un único aviso, agrupado si son varios. */
export function notificationContent(list: Session[]): { title: string; body: string } {
  if (list.length === 1) {
    const s = list[0];
    return { title: `${s.title || "Una sesión"} te necesita`, body: s.lastMessage ?? "Lleva más de 1 minuto esperando." };
  }
  return { title: `${list.length} sesiones te necesitan`, body: list.map((s) => s.title || "sin título").join(" · ") };
}

export type Permission = "default" | "granted" | "denied" | "unsupported";

/** Botón de la barra para pedir el permiso. */
export function notifyButton(p: Permission): { text: string; disabled: boolean; hidden: boolean; help?: string } {
  if (p === "unsupported") return { text: "", disabled: true, hidden: true };
  if (p === "granted") return { text: "Avisos activados", disabled: true, hidden: false };
  if (p === "denied") return { text: "Avisos bloqueados", disabled: true, hidden: false, help: "El navegador bloqueó los avisos de esta página. Actívalos en el candado de la barra de direcciones → Notificaciones → Permitir, y recarga." };
  return { text: "Activar avisos", disabled: false, hidden: false };
}

/**
 * Sesiones que acaban de responder: estaban trabajando (o esperando permiso) y ahora están para revisar.
 * `previous` es el estado anterior por id; la primera vez (vacío) no avisa de nada.
 */
export function decideFinished(previous: ReadonlyMap<string, Session["state"]>, sessions: Session[]): { finished: Session[]; states: Map<string, Session["state"]> } {
  const states = new Map(sessions.map((s) => [s.id, s.state] as const));
  const finished = sessions.filter((s) => {
    const before = previous.get(s.id);
    return s.state === "para_revisar" && (before === "trabajando" || before === "te_necesita");
  });
  return { finished, states };
}

/** Aviso de sesiones que terminaron, agrupado si son varias. */
export function finishedContent(list: Session[]): { title: string; body: string } {
  if (list.length === 1) {
    const s = list[0];
    return { title: `${s.title || "Una sesión"} ya respondió`, body: `Lista para revisar${s.project?.name ? ` · ${s.project.name}` : ""}` };
  }
  return { title: `${list.length} sesiones ya respondieron`, body: list.map((s) => s.title || "sin título").join(" · ") };
}
