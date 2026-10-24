import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { DayTokens, LogEntry, SessionState, Tokens, UsageLimits } from "@ciudad/shared";
import { codexLimits } from "./usage.ts";

export const DEFAULT_CODEX_DIR = path.join(os.homedir(), ".codex");
export const DEFAULT_CODEX_DAYS = 7;

/** Lo que se saca de un rollout de Codex (`~/.codex/sessions/AAAA/MM/DD/rollout-*.jsonl`). Nunca el texto de los mensajes. */
export type CodexRollout = {
  id: string;
  cwd?: string;
  model?: string;
  tokens: Tokens;
  /** Turno abierto (task_started sin task_complete) o terminado. */
  working: boolean;
  /** Hubo al menos un turno terminado. */
  finished: boolean;
  lastEventAt: Date;
  toolCalls: number;
  log: LogEntry[];
  byDay: Record<string, number>;
  /** Subagente lanzado por otra sesión: no es un piso propio. */
  subagent: boolean;
  /** Último `rate_limits` del rollout (límite de uso de la cuenta), si lo trae. */
  limits?: UsageLimits;
};

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Parser incremental de un rollout: se le dan líneas completas a medida que el archivo crece. */
export type RolloutParser = { feed(text: string): void; result(): CodexRollout | null };

export function createRolloutParser(fileId?: string): RolloutParser {
  let meta: { id?: string; cwd?: string; source?: unknown } | undefined;
  let model: string | undefined;
  let tokens: Tokens = { input: 0, output: 0, cacheRead: 0, cacheCreation: 0 };
  let working = false;
  let finished = false;
  let last = 0;
  let toolCalls = 0;
  const log: LogEntry[] = [];
  const byDay: Record<string, number> = {};
  let limits: UsageLimits | undefined;
  const push = (at: string, label: string) => {
    const prev = log[log.length - 1];
    if (prev && prev.label === label) {
      prev.count++;
      prev.at = at;
    } else log.push({ at, label, count: 1 });
    if (log.length > 20) log.shift();
  };

  const feed = (text: string): void => {
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      let o: { timestamp?: string; type?: string; payload?: Record<string, any> };
      try {
        o = JSON.parse(line);
      } catch {
        continue; // línea a medio escribir
      }
      const p = o.payload ?? {};
      const t = Date.parse(o.timestamp ?? "");
      if (Number.isFinite(t) && t > last) last = t;
      const at = Number.isFinite(t) ? new Date(t).toISOString() : "";

      if (o.type === "session_meta") {
        // Un subagente repite el session_meta del padre: vale el que coincide con el archivo, o el primero.
        if (!meta || (fileId && p.id === fileId)) meta = { id: p.id, cwd: p.cwd, source: p.source };
      } else if (o.type === "turn_context" && typeof p.model === "string") {
        model = p.model;
      } else if (o.type === "event_msg") {
        if (p.type === "thread_settings_applied" && typeof p.thread_settings?.model === "string") model = p.thread_settings.model;
        else if (p.type === "task_started") {
          working = true;
          push(at, "Turno");
        } else if (p.type === "task_complete" || p.type === "turn_aborted") {
          working = false;
          finished = true;
        } else if (p.type === "token_count") {
          if (at) limits = codexLimits(p.rate_limits, at) ?? limits;
          if (!p.info?.total_token_usage) continue;
          const u = p.info.total_token_usage;
          const cached = Number(u.cached_input_tokens) || 0;
          tokens = {
            input: Math.max(0, (Number(u.input_tokens) || 0) - cached),
            output: Number(u.output_tokens) || 0,
            cacheRead: cached,
            cacheCreation: Number(u.cache_write_input_tokens) || 0,
          };
          const lastUse = p.info.last_token_usage;
          if (lastUse && Number.isFinite(t)) {
            const day = localDay(new Date(t));
            byDay[day] = (byDay[day] ?? 0) + (Number(lastUse.total_tokens) || 0);
          }
        }
      } else if (o.type === "response_item" && (p.type === "function_call" || p.type === "custom_tool_call")) {
        toolCalls++;
        push(at, `Herramienta ${typeof p.name === "string" ? p.name : "?"}`);
      }
    }
  };

  const result = (): CodexRollout | null => {
    const id = meta?.id ?? fileId;
    if (!meta || typeof id !== "string" || !id) return null;
    const source = meta.source;
    const subagent = typeof source === "object" && source !== null && "subagent" in source;
    return {
      id,
      cwd: typeof meta.cwd === "string" ? meta.cwd : undefined,
      model,
      tokens: { ...tokens },
      working,
      finished,
      lastEventAt: new Date(last),
      toolCalls,
      log: log.map((e) => ({ ...e })),
      byDay: { ...byDay },
      subagent,
      limits,
    };
  };

  return { feed, result };
}

/** Parsea un rollout completo. Devuelve null si no tiene `session_meta` propio. Puro sobre el texto. */
export function parseRollout(text: string, fileId?: string): CodexRollout | null {
  const parser = createRolloutParser(fileId);
  parser.feed(text);
  return parser.result();
}

/** Estado del piso: trabajando con un turno abierto; amarillo si terminó hace poco; si no, dormida. */
export function codexState(r: CodexRollout, now: Date, idleMs: number): SessionState {
  const idle = now.getTime() - r.lastEventAt.getTime() >= idleMs;
  if (idle) return "dormida";
  if (r.working) return "trabajando";
  return r.finished ? "para_revisar" : "dormida";
}

/** Tokens por día de los últimos 7 días (mismo formato que Claude). */
export function codexDaily(byDay: Record<string, number>, now: Date): DayTokens[] {
  const out: DayTokens[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    out.push({ day: localDay(d), tokens: byDay[localDay(d)] ?? 0 });
  }
  return out;
}

const ROLLOUT = /^rollout-.*-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.jsonl$/i;

/** Rollouts modificados en la ventana, recorriendo solo las carpetas de día que pueden contenerlos. */
export async function findRecentRollouts(root: string, now: Date, maxAgeMs: number): Promise<{ id: string; file: string; mtimeMs: number; size: number }[]> {
  const out: { id: string; file: string; mtimeMs: number; size: number }[] = [];
  const days = Math.ceil(maxAgeMs / 86_400_000) + 1;
  const seen = new Set<string>();
  for (let i = 0; i <= days; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i);
    const dir = path.join(root, String(d.getFullYear()), String(d.getMonth() + 1).padStart(2, "0"), String(d.getDate()).padStart(2, "0"));
    if (seen.has(dir)) continue;
    seen.add(dir);
    let names: string[];
    try {
      names = await fs.readdir(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      const m = ROLLOUT.exec(name);
      if (!m) continue;
      const file = path.join(dir, name);
      try {
        const st = await fs.stat(file);
        if (st.isFile() && now.getTime() - st.mtimeMs <= maxAgeMs) out.push({ id: m[1], file, mtimeMs: st.mtimeMs, size: st.size });
      } catch {
        // borrado entre readdir y stat
      }
    }
  }
  return out;
}

/** Títulos de `session_index.jsonl` (`thread_name` por id). Sin archivo, vacío. */
export async function readThreadNames(codexDir: string): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  let text: string;
  try {
    text = await fs.readFile(path.join(codexDir, "session_index.jsonl"), "utf8");
  } catch {
    return names;
  }
  for (const line of text.split("\n")) {
    try {
      const o = JSON.parse(line) as { id?: unknown; thread_name?: unknown };
      if (typeof o.id === "string" && typeof o.thread_name === "string" && o.thread_name) names.set(o.id, o.thread_name);
    } catch {
      // línea vacía o rota
    }
  }
  return names;
}

export function codexDaysFromEnv(value = process.env.CIUDAD_CODEX_DAYS): number {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : DEFAULT_CODEX_DAYS;
}
