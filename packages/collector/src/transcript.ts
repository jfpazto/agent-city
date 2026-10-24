import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { LogEntry, ToolCounts, Tokens, SessionFailure } from "@ciudad/shared";

/** Tokens de un modelo; `cacheCreation1h` es la parte de `cacheCreation` escrita con caché de 1 h (se cobra distinto). */
export type ModelTokens = Tokens & { cacheCreation1h: number };

/** `byModel`: tokens por modelo, para poner a cada uno su precio. */
export type TranscriptMetrics = {
  model?: string;
  tokens: Tokens;
  byModel: Record<string, ModelTokens>;
  tools: ToolCounts;
  editedFiles: string[];
  /** Primer `cwd` visto y último título puesto a mano (`custom-title`). Sirven para el arranque en frío. */
  cwd?: string;
  title?: string;
  log: LogEntry[];
  /** Tokens por día local (AAAA-MM-DD). */
  byDay: Record<string, number>;
  /** Último error de la API de la conversación principal, si no hubo respuesta buena después. */
  failure?: SessionFailure;
  /** Transcripts de subagentes sumados (solo en `readSession`). */
  subagents?: number;
};

export type TokenAccumulator = {
  seen: Set<string>;
  tokens: Tokens;
  byModel: Record<string, ModelTokens>;
  model?: string;
  seenTools: Set<string>;
  tools: ToolCounts;
  edited: Set<string>;
  cwd?: string;
  title?: string;
  log: LogEntry[];
  byDay: Record<string, number>;
  failure?: SessionFailure;
};

const KIND: Record<string, keyof ToolCounts> = {
  Bash: "commands",
  Read: "reads",
  Grep: "reads",
  Glob: "reads",
  WebFetch: "web",
  WebSearch: "web",
};
const EDIT_TOOLS = new Set(["Edit", "MultiEdit", "Write", "NotebookEdit"]);

export const LOG_MAX = 20;

/** Etiqueta de la bitácora para una herramienta (solo el tipo de acción, nunca su contenido). */
export function actionLabel(tool: string): string {
  if (tool === "Bash") return "Ejecutando comandos";
  if (["Read", "Grep", "Glob"].includes(tool)) return "Leyendo código";
  if (EDIT_TOOLS.has(tool)) return "Escribiendo código";
  if (tool === "WebFetch" || tool === "WebSearch") return "Buscando en la web";
  if (tool === "Agent" || tool === "Task") return "Delegando en un subagente";
  if (tool === "TodoWrite" || tool.endsWith("update_plan")) return "Planificando";
  if (tool.startsWith("mcp__")) return "Usando herramientas externas";
  return `Usando ${tool}`;
}

/** Añade a la bitácora; si repite la última etiqueta, la agrupa (×N, hora más reciente). */
export function pushLog(log: LogEntry[], at: string, label: string, max = LOG_MAX): void {
  const last = log[log.length - 1];
  if (last && last.label === label) {
    last.count++;
    if (at > last.at) last.at = at;
  } else {
    log.push({ at, label, count: 1 });
    if (log.length > max) log.splice(0, log.length - max);
  }
}

/** Fecha local AAAA-MM-DD de un instante. */
export function localDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Cuenta las llamadas a herramientas de un mensaje (cada tool_use id una vez). */
function countTools(acc: TokenAccumulator, content: unknown, at?: string): void {
  if (!Array.isArray(content)) return;
  for (const b of content as { type?: unknown; id?: unknown; name?: unknown; input?: Record<string, unknown> }[]) {
    if (b?.type !== "tool_use" || typeof b.name !== "string" || typeof b.id !== "string") continue;
    if (acc.seenTools.has(b.id)) continue;
    acc.seenTools.add(b.id);
    const kind = KIND[b.name];
    if (kind) acc.tools[kind]++;
    if (at) pushLog(acc.log, at, actionLabel(b.name));
    if (EDIT_TOOLS.has(b.name)) {
      const file = b.input?.file_path ?? b.input?.notebook_path;
      if (typeof file === "string" && file) acc.edited.add(file);
    }
  }
}

const zero = (): Tokens => ({ input: 0, output: 0, cacheRead: 0, cacheCreation: 0 });

export function createTokenAccumulator(): TokenAccumulator {
  return {
    seen: new Set(),
    tokens: zero(),
    byModel: {},
    seenTools: new Set(),
    tools: { commands: 0, reads: 0, web: 0 },
    edited: new Set(),
    log: [],
    byDay: {},
  };
}

function failureKind(error: unknown): SessionFailure["kind"] {
  if (error === "rate_limit") return "rate_limit";
  if (error === "authentication_failed") return "auth";
  return "api";
}

const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);

/**
 * Procesa líneas completas del .jsonl. Cada `message.id` cuenta una vez: Claude Code
 * repite el mismo mensaje (con el mismo usage) en una línea por bloque de contenido.
 */
export function feedLines(acc: TokenAccumulator, text: string): void {
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let o: {
      type?: unknown;
      message?: {
        id?: unknown;
        model?: unknown;
        usage?: Record<string, unknown>;
      };
    };
    try {
      o = JSON.parse(line);
    } catch {
      continue;
    }
    const rec = o as {
      cwd?: unknown;
      type?: unknown;
      customTitle?: unknown;
      timestamp?: unknown;
      isMeta?: unknown;
      message?: { content?: unknown };
    };
    const at = typeof rec.timestamp === "string" && !Number.isNaN(Date.parse(rec.timestamp)) ? rec.timestamp : undefined;
    // Un encargo nuevo del usuario (texto, no el resultado de una herramienta).
    const text = rec.message?.content;
    if (at && rec.type === "user" && !rec.isMeta && typeof text === "string" && !text.trimStart().startsWith("<")) {
      pushLog(acc.log, at, "Recibió un encargo");
    }
    if (!acc.cwd && typeof rec.cwd === "string" && rec.cwd) acc.cwd = rec.cwd;
    if (rec.type === "custom-title" && typeof rec.customTitle === "string" && rec.customTitle.trim()) {
      acc.title = rec.customTitle.trim();
    }
    const m = o?.message;
    if (o?.type !== "assistant" || !m || typeof m !== "object") continue;
    // Los errores de la API llegan como un mensaje del asistente marcado; los de subagentes no averían el piso.
    const err = o as { isApiErrorMessage?: unknown; error?: unknown; isSidechain?: unknown };
    if (err.isSidechain !== true) {
      if (err.isApiErrorMessage === true) {
        acc.failure = { kind: failureKind(err.error), at: at ?? new Date(0).toISOString() };
        continue;
      }
      acc.failure = undefined;
    }
    if (typeof m.model === "string" && m.model && !m.model.startsWith("<")) acc.model = m.model;
    countTools(acc, (m as { content?: unknown }).content, at);
    const u = m.usage;
    if (!u || typeof u !== "object" || typeof m.id !== "string" || acc.seen.has(m.id)) continue;
    acc.seen.add(m.id);
    const add: Tokens = {
      input: num(u.input_tokens),
      output: num(u.output_tokens),
      cacheRead: num(u.cache_read_input_tokens),
      cacheCreation: num(u.cache_creation_input_tokens),
    };
    const key = typeof m.model === "string" && m.model ? m.model : "?";
    if (at) {
      const day = localDay(new Date(at));
      acc.byDay[day] = (acc.byDay[day] ?? 0) + add.input + add.output + add.cacheRead + add.cacheCreation;
    }
    const per = (acc.byModel[key] ??= { ...zero(), cacheCreation1h: 0 });
    for (const k of Object.keys(add) as (keyof Tokens)[]) {
      acc.tokens[k] += add[k];
      per[k] += add[k];
    }
    const cc = u.cache_creation as Record<string, unknown> | undefined;
    per.cacheCreation1h += Math.min(add.cacheCreation, num(cc?.ephemeral_1h_input_tokens));
  }
}

export const DEFAULT_TRANSCRIPTS_DIR = path.join(os.homedir(), ".claude", "projects");

/** Solo .jsonl dentro de la carpeta de transcripts. */
export function isAllowedTranscript(file: string, root: string): boolean {
  const abs = path.resolve(file);
  const rel = path.relative(path.resolve(root), abs);
  return abs.endsWith(".jsonl") && rel !== "" && !rel.startsWith("..") && !path.isAbsolute(rel);
}

export type TranscriptReader = {
  read(file: string): Promise<TranscriptMetrics | undefined>;
  /** El transcript principal más los de sus subagentes (`<id>/subagents/*.jsonl`), sumados. */
  readSession(file: string): Promise<TranscriptMetrics | undefined>;
};

/**
 * Suma a la sesión principal el consumo de sus subagentes: tokens, tokens por modelo (para el coste),
 * por día, herramientas y archivos editados. Modelo, carpeta, título y bitácora siguen siendo los de la principal.
 */
export function mergeSubagents(main: TranscriptMetrics, subs: TranscriptMetrics[]): TranscriptMetrics {
  const out: TranscriptMetrics = {
    ...main,
    tokens: { ...main.tokens },
    byModel: Object.fromEntries(Object.entries(main.byModel).map(([k, v]) => [k, { ...v }])),
    tools: { ...main.tools },
    byDay: { ...main.byDay },
  };
  const edited = new Set(main.editedFiles);
  for (const sub of subs) {
    for (const k of Object.keys(out.tokens) as (keyof Tokens)[]) out.tokens[k] += sub.tokens[k];
    for (const [model, t] of Object.entries(sub.byModel)) {
      const per = (out.byModel[model] ??= { ...zero(), cacheCreation1h: 0 });
      for (const k of Object.keys(t) as (keyof ModelTokens)[]) per[k] += t[k];
    }
    for (const k of Object.keys(out.tools) as (keyof ToolCounts)[]) out.tools[k] += sub.tools[k];
    for (const [day, n] of Object.entries(sub.byDay)) out.byDay[day] = (out.byDay[day] ?? 0) + n;
    for (const f of sub.editedFiles) edited.add(f);
  }
  out.editedFiles = [...edited];
  return out;
}

/** Lectura incremental por bytes: guarda offset y acumulador por ruta. */
export function createTranscriptReader(options: { root?: string } = {}): TranscriptReader {
  const root = options.root ?? process.env.CIUDAD_TRANSCRIPTS_DIR ?? DEFAULT_TRANSCRIPTS_DIR;
  const state = new Map<string, { offset: number; acc: TokenAccumulator }>();
  const queues = new Map<string, Promise<unknown>>();
  const snapshot = (acc: TokenAccumulator): TranscriptMetrics => ({
    model: acc.model,
    tokens: { ...acc.tokens },
    byModel: Object.fromEntries(Object.entries(acc.byModel).map(([k, v]) => [k, { ...v }])),
    tools: { ...acc.tools },
    editedFiles: [...acc.edited],
    cwd: acc.cwd,
    title: acc.title,
    log: acc.log.map((e) => ({ ...e })),
    byDay: { ...acc.byDay },
    ...(acc.failure ? { failure: { ...acc.failure } } : {}),
  });

  async function readNow(file: string): Promise<TranscriptMetrics | undefined> {
    let fh: fs.FileHandle;
    try {
      fh = await fs.open(file, "r");
    } catch {
      return undefined; // aún no existe
    }
    try {
      const { size } = await fh.stat();
      let st = state.get(file);
      if (!st || size < st.offset) {
        st = { offset: 0, acc: createTokenAccumulator() };
        state.set(file, st);
      }
      if (size > st.offset) {
        const buf = Buffer.alloc(size - st.offset);
        const { bytesRead } = await fh.read(buf, 0, buf.length, st.offset);
        const end = buf.subarray(0, bytesRead).lastIndexOf(0x0a);
        if (end >= 0) {
          feedLines(st.acc, buf.subarray(0, end + 1).toString("utf8"));
          st.offset += end + 1;
        }
      }
      return snapshot(st.acc);
    } finally {
      await fh.close();
    }
  }

  function read(file: string): Promise<TranscriptMetrics | undefined> {
    if (!isAllowedTranscript(file, root)) return Promise.resolve(undefined);
    // Una lectura a la vez por archivo: si no, el offset avanzaría dos veces.
    const next = (queues.get(file) ?? Promise.resolve()).then(() => readNow(file));
    const settled = next.catch(() => undefined);
    queues.set(file, settled);
    void settled.then(() => queues.get(file) === settled && queues.delete(file));
    return next;
  }

  return {
    read,
    async readSession(file) {
      const main = await read(file);
      if (!main) return undefined;
      const dir = path.join(file.slice(0, -".jsonl".length), "subagents");
      let names: string[];
      try {
        names = (await fs.readdir(dir)).filter((n) => n.endsWith(".jsonl"));
      } catch {
        return main; // sin subagentes
      }
      const subs = (await Promise.all(names.map((n) => read(path.join(dir, n))))).filter((m): m is TranscriptMetrics => !!m);
      return subs.length ? { ...mergeSubagents(main, subs), subagents: subs.length } : main;
    },
  };
}

/** Transcripts de sesión principal (`<root>/<proyecto>/<id>.jsonl`, sin subagentes) modificados en las últimas `maxAgeMs`. */
export async function findRecentTranscripts(
  root: string,
  now: Date,
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<{ id: string; file: string; mtime: Date }[]> {
  const out: { id: string; file: string; mtime: Date }[] = [];
  let projects: string[];
  try {
    projects = await fs.readdir(root);
  } catch {
    return out;
  }
  for (const p of projects) {
    let names: string[];
    try {
      names = await fs.readdir(path.join(root, p));
    } catch {
      continue; // no es carpeta
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const file = path.join(root, p, name);
      try {
        const st = await fs.stat(file);
        if (st.isFile() && now.getTime() - st.mtimeMs <= maxAgeMs) {
          out.push({ id: name.slice(0, -".jsonl".length), file, mtime: st.mtime });
        }
      } catch {
        // desapareció entre readdir y stat
      }
    }
  }
  return out.sort((a, b) => a.mtime.getTime() - b.mtime.getTime());
}

/** Los últimos `days` días (del más antiguo a hoy) con sus tokens; 0 si no hubo actividad. */
export function lastDays(byDay: Record<string, number>, now: Date, days = 7): { day: string; tokens: number }[] {
  const out: { day: string; tokens: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 12);
    const day = localDay(d);
    out.push({ day, tokens: byDay[day] ?? 0 });
  }
  return out;
}
