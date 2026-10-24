export type HealthResponse = { ok: true; service: "collector" };

export type SessionState = "trabajando" | "te_necesita" | "para_revisar" | "dormida";
export type AgentProvider = "claude" | "codex";

export type Tokens = { input: number; output: number; cacheRead: number; cacheCreation: number };

/** Llamadas a herramientas por tipo (domain-model: comandos Bash, lecturas Read/Grep/Glob, web WebFetch/WebSearch). */
export type ToolCounts = { commands: number; reads: number; web: number };

/** Una acción de la bitácora: qué tipo de cosa hizo y cuándo (nunca el contenido). `count` agrupa repeticiones seguidas. */
export type LogEntry = { at: string; label: string; count: number };

/** Tokens de un día (fecha local AAAA-MM-DD). */
export type DayTokens = { day: string; tokens: number };

/** Proyecto/agente representado por un edificio. La identidad Git es común a sus worktrees. */
export type Project = { id: string; name: string; root?: string; order?: number };

export type Session = {
  id: string;
  /** Origen de la sesión. Ausente en colectores anteriores: Claude. */
  agent?: AgentProvider;
  title: string;
  cwd?: string;
  transcriptPath?: string;
  state: SessionState;
  floor: number;
  project?: Project;
  /** Piso local del edificio; `floor` conserva el orden global anterior. */
  projectFloor?: number;
  lastEventAt: string;
  lastTool?: string;
  lastMessage?: string;
  /** Último modelo real visto en el transcript. */
  model?: string;
  /** Tokens sumados del transcript (cada mensaje una vez). */
  tokens?: Tokens;
  /** Coste estimado en $ a precio de API (undefined si el modelo no está en la tabla). */
  costUsd?: number;
  tools?: ToolCounts;
  /** Archivos editados (Edit, MultiEdit, Write, NotebookEdit), sin repetir, en orden de primera edición. */
  editedFiles?: string[];
  /** Últimas acciones, de la más antigua a la más reciente (máx. 20). */
  log?: LogEntry[];
  /** Tokens de los últimos 7 días, del más antiguo a hoy. */
  daily?: DayTokens[];
  /** Subagentes trabajando ahora (los que mandaron eventos con `agent_id` y aún no su SubagentStop). */
  subagentsActive?: number;
  /** Subagentes lanzados en toda la sesión (transcripts `<id>/subagents/*.jsonl`). */
  subagentsTotal?: number;
  /** La última respuesta fue un error de la API y aún no hay otra buena: piso con avería. */
  failure?: SessionFailure;
  /** Contexto usado (0-100) según la statusline de Claude Code. Solo sesiones abiertas con statusline. */
  contextPercent?: number;
};

/** Último error de la API en la conversación principal (límite de uso, autenticación u otro). Nunca su texto. */
export type SessionFailure = { kind: "rate_limit" | "auth" | "api"; at: string };

/** Una ventana del límite de uso del proveedor: porcentaje gastado (0-100) y cuándo se recarga (ISO). */
export type UsageWindow = { usedPercent: number; resetsAt: string; windowMinutes: number };

/** Último límite de uso conocido de un proveedor. `observedAt`: cuándo se leyó el dato en origen. */
export type UsageLimits = { provider: AgentProvider; fiveHour?: UsageWindow; weekly?: UsageWindow; observedAt: string };

/**
 * Día rebobinado (GET /history?day=AAAA-MM-DD): datos fijos de cada sesión y un fotograma cada `stepMs`
 * con [id, estado, última actividad] de las sesiones que había en ese momento. Solo Claude.
 */
export type HistoryResponse = {
  from: string;
  to: string;
  stepMs: number;
  sessions: Record<string, Pick<Session, "id" | "title" | "cwd" | "floor" | "project" | "projectFloor">>;
  frames: { at: string; sessions: [id: string, state: SessionState, lastEventAt: string][] }[];
};

export type ServerMessage =
  | { type: "snapshot"; sessions: Session[]; usage?: UsageLimits[] }
  | { type: "usage"; limits: UsageLimits }
  | { type: "session"; session: Session }
  | { type: "removed"; id: string };
