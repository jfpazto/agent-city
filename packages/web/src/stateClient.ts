import type { AgentProvider, ServerMessage, Session, UsageLimits } from "@ciudad/shared";

export type ConnectionStatus = "conectando" | "conectado" | "desconectado";

/**
 * Aplica un mensaje crudo del colector al mapa de sesiones.
 * Devuelve el tipo de mensaje aplicado, o false (y no toca nada) si no se entiende.
 */
export function applyMessage(sessions: Map<string, Session>, raw: string, usage?: Map<AgentProvider, UsageLimits>): ServerMessage["type"] | false {
  let msg: ServerMessage;
  try {
    msg = JSON.parse(raw) as ServerMessage;
  } catch {
    console.warn("[ciudad] mensaje del colector no válido, se descarta");
    return false;
  }
  if (msg?.type === "snapshot" && Array.isArray(msg.sessions)) {
    sessions.clear();
    for (const s of msg.sessions) sessions.set(s.id, s);
    if (usage) {
      usage.clear();
      for (const l of Array.isArray(msg.usage) ? msg.usage : []) usage.set(l.provider, l);
    }
  } else if (msg?.type === "usage" && msg.limits) {
    usage?.set(msg.limits.provider, msg.limits);
  } else if (msg?.type === "session" && msg.session) {
    sessions.set(msg.session.id, msg.session);
  } else if (msg?.type === "removed") {
    sessions.delete(msg.id);
  } else {
    return false;
  }
  return msg.type;
}

const MIN_DELAY = 500;
const MAX_DELAY = 5000;

/**
 * Mantiene el estado de las sesiones a partir del WebSocket del colector
 * y se reconecta solo con espera creciente (0,5 s → 5 s).
 */
export function connectState(
  url: string,
  onChange: (sessions: Session[]) => void,
  onStatus: (status: ConnectionStatus) => void = () => {},
  onUsage: (usage: UsageLimits[]) => void = () => {},
): () => void {
  const sessions = new Map<string, Session>();
  const usage = new Map<AgentProvider, UsageLimits>();
  let delay = MIN_DELAY;
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const emit = () => onChange([...sessions.values()].sort((a, b) => a.floor - b.floor));

  const open = () => {
    onStatus("conectando");
    socket = new WebSocket(url);
    socket.onopen = () => {
      delay = MIN_DELAY;
      onStatus("conectado");
    };
    socket.onmessage = (ev) => {
      const kind = applyMessage(sessions, String(ev.data), usage);
      if (kind === "usage" || kind === "snapshot") onUsage([...usage.values()]);
      // Un cambio de límite no toca las sesiones: no hace falta repintar la ciudad entera.
      if (kind && kind !== "usage") emit();
    };
    socket.onclose = () => {
      onStatus("desconectado");
      if (stopped) return;
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, MAX_DELAY);
    };
  };

  open();
  return () => {
    stopped = true;
    clearTimeout(timer);
    socket?.close();
  };
}
