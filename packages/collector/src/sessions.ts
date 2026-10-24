import path from "node:path";
import type { ServerMessage, Session } from "@ciudad/shared";
import { createProjectResolver } from "./projects.ts";

export type InternalSession = Session & {
  // Llamadas que esperan permiso: tool_use_id, o "tool:<nombre>" si no se pudo emparejar.
  pending: string[];
  // Último tool_use_id visto por herramienta (PermissionRequest no trae id propio).
  lastUseIdByTool: Record<string, string>;
  // Subagentes en marcha: agent_id → agent_type.
  activeAgents: Record<string, string>;
};

// Forma mínima de un evento de hook de Claude Code (ver docs/domain-model.md).
export type HookEvent = {
  hook_event_name?: string;
  session_id?: string;
  cwd?: string;
  transcript_path?: string;
  session_title?: string;
  tool_name?: string;
  tool_use_id?: string;
  notification_type?: string;
  message?: string;
  [k: string]: unknown;
};

function create(e: HookEvent, id: string, floor: number, now: Date): InternalSession {
  return {
    id,
    title: e.session_title || (e.cwd ? path.basename(e.cwd) : id.slice(0, 8)),
    cwd: e.cwd,
    transcriptPath: e.transcript_path,
    state: "dormida",
    floor,
    lastEventAt: now.toISOString(),
    pending: [],
    lastUseIdByTool: {},
    activeAgents: {},
  };
}

/**
 * Transición pura. Devuelve la sesión nueva, `null` si la sesión se retira,
 * o `undefined` si el evento se ignora.
 */
export function reduce(
  current: InternalSession | undefined,
  e: HookEvent,
  now: Date,
  floor = current?.floor ?? 0,
): InternalSession | null | undefined {
  const id = e.session_id;
  const name = e.hook_event_name;
  if (typeof id !== "string" || !id || typeof name !== "string") return undefined;
  if (name === "SessionEnd") return current ? null : undefined;

  const base = current ?? create(e, id, floor, now);
  const s: InternalSession = {
    ...base,
    pending: [...base.pending],
    lastUseIdByTool: { ...base.lastUseIdByTool },
    activeAgents: { ...base.activeAgents },
  };
  const busy = () => (s.state = s.pending.length > 0 ? "te_necesita" : "trabajando");
  s.lastEventAt = now.toISOString();
  if (e.cwd) s.cwd = e.cwd;
  if (e.transcript_path) s.transcriptPath = e.transcript_path;
  // Los eventos de un subagente traen su agent_id (y el session_id de la madre); su SubagentStop lo cierra.
  const agentId = typeof e.agent_id === "string" && e.agent_id ? e.agent_id : undefined;
  if (agentId && name === "SubagentStop") delete s.activeAgents[agentId];
  else if (agentId) s.activeAgents[agentId] = typeof e.agent_type === "string" ? e.agent_type : "";
  s.subagentsActive = Object.keys(s.activeAgents).length;

  switch (name) {
    case "SessionStart":
      break;
    case "UserPromptSubmit":
      s.state = "trabajando";
      s.pending = [];
      if (e.session_title) s.title = e.session_title;
      break;
    case "PreToolUse":
      if (e.tool_name) {
        const previous = s.lastUseIdByTool[e.tool_name];
        // Una llamada nueva de la misma herramienta da por resuelto (p. ej., denegado)
        // el permiso pendiente de la llamada anterior.
        if (e.tool_use_id && previous && previous !== e.tool_use_id) {
          s.pending = s.pending.filter((k) => k !== previous && k !== `tool:${e.tool_name}`);
        }
        s.lastTool = e.tool_name;
        if (e.tool_use_id) s.lastUseIdByTool[e.tool_name] = e.tool_use_id;
      }
      busy();
      break;
    case "PostToolUse":
    case "PostToolUseFailure":
      // Al aprobar (o al fallar/denegarse) llega uno de estos eventos. Solo resuelve el
      // permiso de su propia llamada: otras herramientas en paralelo no apagan el rojo.
      s.pending = s.pending.filter((k) => k !== e.tool_use_id && k !== `tool:${e.tool_name}`);
      busy();
      break;
    case "PermissionRequest": {
      const name = e.tool_name ?? "?";
      const key = e.tool_use_id ?? s.lastUseIdByTool[name] ?? `tool:${name}`;
      if (!s.pending.includes(key)) s.pending.push(key);
      s.state = "te_necesita";
      s.lastMessage = `Necesita permiso para ${e.tool_name ?? "una herramienta"}`;
      break;
    }
    case "Notification":
      if (e.message) s.lastMessage = e.message;
      // Un aviso de permiso que llega cuando ya se resolvió no vuelve a poner el rojo.
      if (e.notification_type === "permission_prompt" && s.pending.length > 0) s.state = "te_necesita";
      break;
    case "Stop":
      s.state = "para_revisar";
      s.pending = [];
      break;
    case "SubagentStop":
      break;
    default:
      return undefined;
  }
  return s;
}

export const DEFAULT_IDLE_MS = 30 * 60 * 1000;
/** Un rojo sin ningún evento en 48 h es una sesión que se cerró sin SessionEnd: deja de pedir atención. */
export const STALE_NEEDS_YOU_MS = 48 * 60 * 60 * 1000;

/**
 * Paso a dormida por inactividad (puro). Devuelve la sesión dormida, o `undefined`
 * si no cambia. `te_necesita` no se duerme por inactividad normal, solo pasadas 48 h sin eventos.
 */
export function expire(s: InternalSession, now: Date, idleMs = DEFAULT_IDLE_MS): InternalSession | undefined {
  if (s.state === "dormida") return undefined;
  const quiet = now.getTime() - Date.parse(s.lastEventAt);
  if (s.state === "te_necesita") {
    return quiet >= Math.max(STALE_NEEDS_YOU_MS, idleMs) ? { ...s, state: "dormida", pending: [], activeAgents: {}, subagentsActive: 0 } : undefined;
  }
  if (quiet < idleMs) return undefined;
  // Un subagente sin SubagentStop no sigue trabajando en una sesión dormida.
  return { ...s, state: "dormida", activeAgents: {}, subagentsActive: 0 };
}

/** Campos de la sesión que salen del transcript. */
export type SessionMetrics = Partial<Pick<Session, "model" | "tokens" | "costUsd" | "tools" | "editedFiles" | "log" | "daily" | "subagentsTotal" | "failure">>;
const METRIC_KEYS = ["model", "tokens", "costUsd", "tools", "editedFiles", "log", "daily", "subagentsTotal", "failure"] as const;

/** Revisar una sesión amarilla la apaga (puro). Devuelve undefined si no estaba en para_revisar. */
export function review(s: InternalSession): InternalSession | undefined {
  return s.state === "para_revisar" ? { ...s, state: "dormida" } : undefined;
}

export type SessionStore = {
  apply(e: HookEvent, now: Date): void;
  /** Duerme las sesiones inactivas y avisa de cada cambio. */
  tick(now: Date): void;
  /** Guarda modelo y tokens del transcript; avisa solo si cambiaron. */
  setMetrics(id: string, m: SessionMetrics): void;
  /** Contexto usado (0-100, de la statusline). Avisa solo si cambia el entero. */
  setContext(id: string, percent: number): void;
  /** El usuario abrió el panel: para_revisar → dormida. `undefined` si no existe; `false` si no cambia. */
  markReviewed(id: string): boolean | undefined;
  /** Arranque en frío: crea la sesión dormida si no existe (si ya llegó un evento, no la toca). */
  seed(s: { id: string; title: string; cwd?: string; transcriptPath: string; lastEventAt: Date }): boolean;
  /**
   * Sesión de Codex leída de su rollout: alta o cambio. Una sesión revisada (dormida) no vuelve a amarillo
   * mientras el rollout no avance.
   */
  upsertCodex(s: Omit<Session, "floor" | "project" | "projectFloor" | "agent">): void;
  /** Retira una sesión (la eliminó el usuario). `false` si no existía. */
  remove(id: string): boolean;
  /** Retira las sesiones de Codex que ya no están en la ventana. */
  pruneCodex(keep: Set<string>): void;
  list(): Session[];
  get(id: string): Session | undefined;
  /** Avisa de cada cambio real (alta, cambio o retirada). Devuelve la función para desuscribirse. */
  subscribe(listener: (msg: Exclude<ServerMessage, { type: "snapshot" | "usage" }>) => void): () => void;
};

function expose({ pending: _p, lastUseIdByTool: _l, activeAgents: _a, ...s }: InternalSession): Session {
  return s;
}

export function createSessionStore(options: { idleMs?: number } = {}): SessionStore {
  const idleMs = options.idleMs ?? DEFAULT_IDLE_MS;
  const sessions = new Map<string, InternalSession>();
  const projectFor = createProjectResolver();
  const projectOrder = new Map<string, number>();
  const listeners = new Set<(msg: Exclude<ServerMessage, { type: "snapshot" | "usage" }>) => void>();

  const notify = (msg: Exclude<ServerMessage, { type: "snapshot" | "usage" }>) => {
    for (const l of listeners) {
      try {
        l(msg);
      } catch (err) {
        console.error("[collector] error en un listener del store", err);
      }
    }
  };

  const freeFloor = () => {
    const used = new Set([...sessions.values()].map((s) => s.floor));
    let f = 0;
    while (used.has(f)) f++;
    return f;
  };

  const locate = (s: InternalSession, current?: InternalSession): InternalSession => {
    const resolved = projectFor(s.cwd);
    if (!projectOrder.has(resolved.id)) projectOrder.set(resolved.id, projectOrder.size);
    const project = { ...resolved, order: projectOrder.get(resolved.id)! };
    if (current?.project?.id === project.id && current.projectFloor !== undefined) {
      return { ...s, project, projectFloor: current.projectFloor };
    }
    const used = new Set([...sessions.values()]
      .filter((other) => other.id !== s.id && other.project?.id === project.id && (other.agent ?? "claude") === (s.agent ?? "claude"))
      .map((other) => other.projectFloor));
    let projectFloor = 0;
    while (used.has(projectFloor)) projectFloor++;
    return { ...s, project, projectFloor };
  };

  return {
    apply(e, now) {
      const id = e.session_id;
      if (typeof id !== "string" || !id) return;
      const current = sessions.get(id);
      const next = reduce(current, e, now, current?.floor ?? freeFloor());
      if (next === undefined) return;
      if (next === null) {
        sessions.delete(id);
        notify({ type: "removed", id });
      } else {
        const located = locate(next, current);
        sessions.set(id, located);
        notify({ type: "session", session: expose(located) });
      }
    },
    tick(now) {
      for (const [id, s] of sessions) {
        const next = expire(s, now, idleMs);
        if (!next) continue;
        sessions.set(id, next);
        notify({ type: "session", session: expose(next) });
      }
    },
    setMetrics(id, m) {
      const s = sessions.get(id);
      if (!s) return;
      const pick = (o: SessionMetrics) => JSON.stringify(METRIC_KEYS.map((k) => o[k]));
      if (pick(s) === pick(m)) return;
      const next = { ...s, ...m };
      if (!m.failure) delete next.failure;
      sessions.set(id, next);
      notify({ type: "session", session: expose(next) });
    },
    setContext(id, percent) {
      const s = sessions.get(id);
      if (!s) return;
      const contextPercent = Math.max(0, Math.min(100, Math.round(percent)));
      if (s.contextPercent === contextPercent) return;
      const next = { ...s, contextPercent };
      sessions.set(id, next);
      notify({ type: "session", session: expose(next) });
    },
    markReviewed(id) {
      const s = sessions.get(id);
      if (!s) return undefined;
      const next = review(s);
      if (!next) return false;
      sessions.set(id, next);
      notify({ type: "session", session: expose(next) });
      return true;
    },
    seed({ id, title, cwd, transcriptPath, lastEventAt }) {
      if (sessions.has(id)) return false;
      const s: InternalSession = {
        id,
        title,
        cwd,
        transcriptPath,
        state: "dormida",
        floor: freeFloor(),
        lastEventAt: lastEventAt.toISOString(),
        pending: [],
        lastUseIdByTool: {},
        activeAgents: {},
      };
      const located = locate(s);
      sessions.set(id, located);
      notify({ type: "session", session: expose(located) });
      return true;
    },
    upsertCodex(input) {
      const current = sessions.get(input.id);
      if (current && current.agent !== "codex") return;
      let state = input.state;
      if (current?.state === "dormida" && state === "para_revisar" && current.lastEventAt === input.lastEventAt) state = "dormida";
      const base: InternalSession = {
        ...input,
        agent: "codex",
        state,
        floor: current?.floor ?? freeFloor(),
        pending: [],
        lastUseIdByTool: {},
        activeAgents: {},
      };
      const located = locate(base, current);
      if (current && JSON.stringify(expose(current)) === JSON.stringify(expose(located))) return;
      sessions.set(input.id, located);
      notify({ type: "session", session: expose(located) });
    },
    remove(id) {
      if (!sessions.delete(id)) return false;
      notify({ type: "removed", id });
      return true;
    },
    pruneCodex(keep) {
      for (const [id, s] of sessions) {
        if (s.agent !== "codex" || keep.has(id)) continue;
        sessions.delete(id);
        notify({ type: "removed", id });
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    list: () => [...sessions.values()].sort((a, b) => a.floor - b.floor).map(expose),
    get: (id) => {
      const s = sessions.get(id);
      return s && expose(s);
    },
  };
}
