import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { HealthResponse } from "@ciudad/shared";
import { appendEvent } from "./eventLog.ts";
import { createSessionStore, DEFAULT_IDLE_MS, type HookEvent, type SessionStore } from "./sessions.ts";
import { estimateSessionCost, loadPrices, type PriceTable } from "./pricing.ts";
import { DEFAULT_TRANSCRIPTS_DIR, createTranscriptReader, findRecentTranscripts, lastDays, type TranscriptMetrics, type TranscriptReader } from "./transcript.ts";
import { attachWsHub, isAllowedOrigin } from "./wsHub.ts";
import { buildHistory, localDayRange, readEvents } from "./history.ts";
import { openSession, SESSION_ID, startSession, type SessionOpener, type SessionStarter } from "./openSession.ts";
import { moveSessionToTrash } from "./trash.ts";
import { claudeLimits, createUsageStore, type UsageStore } from "./usage.ts";
import { codexDaily, codexDaysFromEnv, codexState, DEFAULT_CODEX_DIR, createRolloutParser, findRecentRollouts, readThreadNames, type CodexRollout, type RolloutParser } from "./codex.ts";

const MAX_BODY = 256 * 1024;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

export type ServerOptions = {
  /** Cómo se abre una sesión al pulsar ▶ en su piso. Por defecto, la app de escritorio y, si no, Terminal. */
  openSession?: SessionOpener;
  /** Cómo se abre una sesión nueva en un proyecto (piso «en venta»). Por defecto, la app de escritorio y, si no, Terminal. */
  startSession?: SessionStarter;
  /** Papelera donde van los transcripts eliminados. Por defecto, ~/.Trash. */
  trashDir?: string;
  eventsDir?: string;
  store?: SessionStore;
  ws?: boolean;
  /** Inactividad antes de dormir una sesión. Por defecto, CIUDAD_IDLE_MINUTES o 30 min. */
  idleMs?: number;
  /** Cada cuánto se revisa la inactividad. Por defecto, min(30 s, idleMs / 2). */
  tickMs?: number;
  /** Carpeta de transcripts permitida. Por defecto, CIUDAD_TRANSCRIPTS_DIR o ~/.claude/projects. */
  transcriptsDir?: string;
  /** Tabla de precios. Por defecto, la de pricing.ts o CIUDAD_PRICES_FILE. */
  prices?: PriceTable;
  /** Reconstruye la torre desde los transcripts recientes (CIUDAD_CLAUDE_DAYS, 2 días) al arrancar. Por defecto, no (main.ts lo activa). */
  coldStart?: boolean;
  /** Carpeta de Codex (`~/.codex` o CIUDAD_CODEX_DIR). `false` desactiva la lectura de Codex. Por defecto, solo con coldStart. */
  codexDir?: string | false;
  /** Cada cuánto se releen los rollouts de Codex. Por defecto, 3 s. */
  codexPollMs?: number;
  /** Archivo donde se conserva el último límite de uso. Por defecto, `data/usage.json` solo con coldStart. */
  usageFile?: string | false;
};

/**
 * Sondeo de Codex: cada rollout reciente (CIUDAD_CODEX_DAYS, 7 días por defecto) es un piso del barrio Codex.
 * Solo se relee un archivo si cambió su tamaño o fecha. Con `usage`, publica el límite de uso más reciente. Nunca lanza.
 */
/** Pasa al parser las líneas completas añadidas desde `offset`. Devuelve cuántos bytes consumió. */
async function feedNewLines(file: string, offset: number, parser: RolloutParser): Promise<number> {
  const fh = await fs.open(file, "r");
  try {
    const { size } = await fh.stat();
    if (size <= offset) return 0;
    const buf = Buffer.alloc(size - offset);
    const { bytesRead } = await fh.read(buf, 0, buf.length, offset);
    const end = buf.subarray(0, bytesRead).lastIndexOf(0x0a);
    if (end < 0) return 0;
    parser.feed(buf.subarray(0, end + 1).toString("utf8"));
    return end + 1;
  } finally {
    await fh.close();
  }
}

export function createCodexPoller(store: SessionStore, codexDir: string, prices: PriceTable, idleMs: number, days = codexDaysFromEnv(), usage?: UsageStore) {
  // Lectura incremental: solo los bytes nuevos de cada rollout, hasta la última línea completa.
  const cache = new Map<string, { key: string; offset: number; parser: RolloutParser; rollout: CodexRollout | null }>();
  const poll = async (now = new Date()): Promise<void> => {
    try {
      const files = await findRecentRollouts(path.join(codexDir, "sessions"), now, days * 86_400_000);
      const names = await readThreadNames(codexDir);
      const keep = new Set<string>();
      for (const f of files) {
        const key = `${f.size}:${f.mtimeMs}`;
        let entry = cache.get(f.file);
        if (!entry || f.size < entry.offset) {
          entry = { key: "", offset: 0, parser: createRolloutParser(f.id), rollout: null };
          cache.set(f.file, entry);
        }
        if (entry.key !== key) {
          entry.offset += await feedNewLines(f.file, entry.offset, entry.parser);
          entry.rollout = entry.parser.result();
          entry.key = key;
        }
        const r = entry.rollout;
        // El límite es de la cuenta: vale el de cualquier rollout, también el de un subagente.
        if (r?.limits) usage?.set(r.limits);
        if (!r || r.subagent) continue;
        keep.add(r.id);
        store.upsertCodex({
          id: r.id,
          title: names.get(r.id) || (r.cwd ? path.basename(r.cwd) : r.id.slice(0, 8)),
          cwd: r.cwd,
          transcriptPath: f.file,
          state: codexState(r, now, idleMs),
          lastEventAt: r.lastEventAt.toISOString(),
          model: r.model,
          tokens: r.tokens,
          costUsd: r.model ? estimateSessionCost({ [r.model]: r.tokens }, prices) : undefined,
          tools: { commands: r.toolCalls, reads: 0, web: 0 },
          log: r.log,
          daily: codexDaily(r.byDay, now),
          contextPercent: r.contextPercent,
        });
      }
      store.pruneCodex(keep);
    } catch (err) {
      console.error("[collector] error leyendo las sesiones de Codex", err);
    }
  };
  /** Turnos de cada sesión de Codex leída (sin subagentes), para Rebobinar. */
  const turns = (): Map<string, [number, number | null][]> =>
    new Map([...cache.values()].flatMap((e) => (e.rollout && !e.rollout.subagent ? [[e.rollout.id, e.rollout.turns] as const] : [])));
  return Object.assign(poll, { turns });
}

/**
 * Arranque en frío: cada transcript reciente se convierte en una sesión dormida con sus métricas.
 * Las sesiones que ya recibieron un evento no se tocan. Nunca lanza.
 */
export async function coldStart(
  store: SessionStore,
  reader: TranscriptReader,
  prices: PriceTable,
  root: string,
  now = new Date(),
  maxAgeMs = 24 * 60 * 60 * 1000,
): Promise<number> {
  let created = 0;
  try {
    for (const t of await findRecentTranscripts(root, now, maxAgeMs)) {
      const m = await reader.readSession(t.file);
      const title = m?.title || (m?.cwd ? path.basename(m.cwd) : t.id.slice(0, 8));
      if (store.seed({ id: t.id, title, cwd: m?.cwd, transcriptPath: t.file, lastEventAt: t.mtime })) created++;
      if (m) store.setMetrics(t.id, metricsOf(m, prices));
    }
  } catch (err) {
    console.error("[collector] error en el arranque en frío", err);
  }
  return created;
}

function metricsOf(m: TranscriptMetrics, prices: PriceTable, now = new Date()) {
  return {
    log: m.log,
    daily: lastDays(m.byDay, now),
    model: m.model,
    tokens: m.tokens,
    costUsd: estimateSessionCost(m.byModel, prices),
    tools: m.tools,
    editedFiles: m.editedFiles,
    subagentsTotal: m.subagents ?? 0,
    failure: m.failure,
  };
}

/** Lee el transcript de una sesión y guarda sus métricas. Nunca lanza. */
async function refreshMetrics(
  store: SessionStore,
  reader: TranscriptReader,
  prices: PriceTable,
  id: string,
): Promise<void> {
  try {
    const file = store.get(id)?.transcriptPath;
    if (!file) return;
    const m = await reader.readSession(file);
    if (m) store.setMetrics(id, metricsOf(m, prices));
  } catch (err) {
    console.error("[collector] error leyendo el transcript", err);
  }
}

/** Días de transcripts de Claude que se cargan al arrancar. Por defecto, 2. */
export function claudeDaysFromEnv(value = process.env.CIUDAD_CLAUDE_DAYS): number {
  const n = Number(value);
  return value && Number.isFinite(n) && n > 0 ? n : 2;
}

export function idleMsFromEnv(value = process.env.CIUDAD_IDLE_MINUTES): number {
  const minutes = Number(value);
  return value && Number.isFinite(minutes) && minutes > 0 ? minutes * 60 * 1000 : DEFAULT_IDLE_MS;
}

/**
 * POST /sessions/:id/reviewed: el usuario abrió el panel de un piso amarillo → dormida.
 * Solo desde páginas locales (mismo criterio que el WebSocket); responde con CORS para ellas.
 */
function handleReviewed(req: http.IncomingMessage, res: http.ServerResponse, store: SessionStore, id: string) {
  const origin = req.headers.origin;
  if (!isAllowedOrigin(origin)) return sendJson(res, 403, { ok: false, error: "forbidden_origin" });
  const cors: Record<string, string> = origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {};
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...cors, "access-control-allow-methods": "POST" });
    return res.end();
  }
  if (req.method !== "POST") return sendJson(res, 405, { ok: false, error: "method_not_allowed" });
  const changed = store.markReviewed(id);
  if (changed === undefined) {
    res.writeHead(404, { ...cors, "content-type": "application/json" });
    return res.end(JSON.stringify({ ok: false, error: "not_found" }));
  }
  res.writeHead(200, { ...cors, "content-type": "application/json" });
  res.end(JSON.stringify({ ok: true, changed }));
}

/**
 * POST /sessions/:id/open: abre la conversación en la app de escritorio (o en Terminal). Lanza un proceso, así que exige
 * un Origin local explícito (no basta con no enviarlo) y una sesión conocida con carpeta.
 */
async function handleOpen(req: http.IncomingMessage, res: http.ServerResponse, store: SessionStore, id: string, open: SessionOpener) {
  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) return sendJson(res, 403, { ok: false, error: "forbidden_origin" });
  const cors = { "access-control-allow-origin": origin, vary: "Origin" };
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...cors, "access-control-allow-methods": "POST" });
    return res.end();
  }
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") return reply(405, { ok: false, error: "method_not_allowed" });
  const s = store.get(id);
  if (!s) return reply(404, { ok: false, error: "not_found" });
  if (!SESSION_ID.test(id) || !s.cwd) return reply(422, { ok: false, error: "not_resumable" });
  try {
    reply(200, { ok: true, openedIn: await open({ id, cwd: s.cwd, agent: s.agent }) });
  } catch (err) {
    console.error("[collector] no se pudo abrir la sesión", err);
    reply(500, { ok: false, error: "open_failed" });
  }
}

/** Cabeceras y respuesta comunes de las acciones locales: Origin local explícito, CORS y preflight. Null si ya respondió. */
function localAction(req: http.IncomingMessage, res: http.ServerResponse): ((status: number, body: unknown) => void) | null {
  const origin = req.headers.origin;
  if (!origin || !isAllowedOrigin(origin)) {
    sendJson(res, 403, { ok: false, error: "forbidden_origin" });
    return null;
  }
  const cors = { "access-control-allow-origin": origin, vary: "Origin" };
  if (req.method === "OPTIONS") {
    res.writeHead(204, { ...cors, "access-control-allow-methods": "POST" });
    res.end();
    return null;
  }
  const reply = (status: number, body: unknown) => {
    res.writeHead(status, { ...cors, "content-type": "application/json" });
    res.end(JSON.stringify(body));
  };
  if (req.method !== "POST") {
    reply(405, { ok: false, error: "method_not_allowed" });
    return null;
  }
  return reply;
}

/**
 * POST /sessions/:id/new: abre una sesión nueva del mismo agente en el proyecto de :id. La carpeta sale del store
 * (raíz del proyecto o cwd), nunca de la petición.
 */
async function handleNew(req: http.IncomingMessage, res: http.ServerResponse, store: SessionStore, id: string, start: SessionStarter) {
  const reply = localAction(req, res);
  if (!reply) return;
  const s = store.get(id);
  if (!s) return reply(404, { ok: false, error: "not_found" });
  const root = s.project?.root ?? s.cwd;
  if (!root || !path.isAbsolute(root)) return reply(422, { ok: false, error: "no_folder" });
  try {
    reply(200, { ok: true, openedIn: await start({ root, agent: s.agent }) });
  } catch (err) {
    console.error("[collector] no se pudo abrir una sesión nueva", err);
    reply(500, { ok: false, error: "start_failed" });
  }
}

/**
 * POST /sessions/:id/delete: manda el transcript de la sesión a la papelera y la retira de la ciudad.
 * No se elimina una sesión trabajando o esperando permiso, ni un archivo fuera de las carpetas de transcripts.
 */
async function handleDelete(req: http.IncomingMessage, res: http.ServerResponse, store: SessionStore, id: string, roots: string[], trashDir?: string) {
  const reply = localAction(req, res);
  if (!reply) return;
  const s = store.get(id);
  if (!s) return reply(404, { ok: false, error: "not_found" });
  if (s.state === "trabajando" || s.state === "te_necesita") return reply(409, { ok: false, error: "session_busy" });
  try {
    if (s.transcriptPath) await moveSessionToTrash(s.transcriptPath, roots, trashDir);
  } catch (err) {
    console.error("[collector] no se pudo mover la sesión a la papelera", err);
    return reply(500, { ok: false, error: "trash_failed" });
  }
  store.remove(id);
  reply(200, { ok: true });
}

/**
 * POST /usage/claude: la statusline de Claude Code reenvía su JSON. Solo se guardan `rate_limits` y el % de contexto de la sesión; el resto se descarta
 * sin escribirse. Mismo criterio de Origin que el WebSocket (la statusline no envía Origin; una web ajena, sí).
 */
async function handleClaudeUsage(req: http.IncomingMessage, res: http.ServerResponse, usage: UsageStore, store: SessionStore) {
  const refused = refuseBrowser(req);
  if (refused) return sendJson(res, refused.status, { ok: false, error: refused.error });
  const body = await readBody(req);
  if (body === null) return sendJson(res, 413, { ok: false, error: "too_large" });
  let input: unknown;
  try {
    input = JSON.parse(body);
  } catch {
    return sendJson(res, 400, { ok: false, error: "invalid_json" });
  }
  const limits = claudeLimits(input, new Date().toISOString());
  if (limits) usage.set(limits);
  const context = sessionContext(input);
  if (context) store.setContext(context.id, context.percent);
  res.writeHead(204);
  res.end();
}

/** `session_id` y `context_window.used_percentage` del JSON de la statusline (Claude Code ≥ 2.1). */
export function sessionContext(statusline: unknown): { id: string; percent: number } | undefined {
  const o = statusline as { session_id?: unknown; context_window?: { used_percentage?: unknown } } | null;
  const id = o?.session_id;
  const percent = o?.context_window?.used_percentage;
  if (typeof id !== "string" || !id || typeof percent !== "number" || !Number.isFinite(percent)) return undefined;
  return { id, percent };
}

/**
 * /hook y /usage/claude solo los llaman los scripts de Claude Code (curl): nunca un navegador.
 * Se rechaza cualquier Origin y se exige JSON, así una web abierta no puede falsear estados
 * con un POST «simple» (form o text/plain), que el navegador envía sin preflight.
 */
function refuseBrowser(req: http.IncomingMessage): { status: number; error: string } | null {
  if (req.headers.origin !== undefined) return { status: 403, error: "forbidden_origin" };
  if (req.method !== "POST") return { status: 405, error: "method_not_allowed" };
  const type = (req.headers["content-type"] ?? "").split(";")[0].trim().toLowerCase();
  if (type !== "application/json") return { status: 415, error: "unsupported_media_type" };
  return null;
}

function sendJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    let tooLarge = false;
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY) tooLarge = true;
      else chunks.push(c);
    });
    req.on("end", () => resolve(tooLarge ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

async function handleHook(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  eventsDir: string,
  store: SessionStore,
  reader: TranscriptReader,
  prices: PriceTable,
) {
  // Origen del evento: sin `agent` es Claude (como siempre); `?agent=codex` lo envía el hook de Codex.
  const agent = new URL(req.url ?? "/", "http://x").searchParams.get("agent") ?? "claude";
  if (agent !== "claude" && agent !== "codex") return sendJson(res, 400, { ok: false, error: "unknown_agent" });
  const refused = refuseBrowser(req);
  if (refused) return sendJson(res, refused.status, { ok: false, error: refused.error });
  const body = await readBody(req);
  if (body === null) return sendJson(res, 413, { ok: false, error: "too_large" });
  let event: unknown;
  try {
    event = JSON.parse(body);
  } catch {
    return sendJson(res, 400, { ok: false, error: "invalid_json" });
  }
  await appendEvent(eventsDir, event, new Date(), { agent });
  // Los eventos de Codex solo se registran: sus pisos salen de los rollouts (codex.ts).
  if (agent === "codex") {
    res.writeHead(204);
    return res.end();
  }
  try {
    store.apply(event as HookEvent, new Date());
  } catch (err) {
    // El hook nunca debe fallar por un error del estado.
    console.error("[collector] error aplicando evento", err);
  }
  const id = (event as HookEvent)?.session_id;
  if (typeof id === "string") void refreshMetrics(store, reader, prices, id);
  res.writeHead(204);
  res.end();
}

/**
 * GET /history?day=AAAA-MM-DD[&step=segundos]: el día reconstruido desde `data/events` (solo metadatos).
 * Lo lee el front desde otro puerto: responde con CORS solo a los orígenes locales permitidos.
 */
async function handleHistory(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  eventsDir: string,
  store: SessionStore,
  idleMs: number,
  codexTurns?: () => Map<string, [number, number | null][]>,
) {
  const origin = req.headers.origin;
  if (origin !== undefined && !isAllowedOrigin(origin)) return sendJson(res, 403, { ok: false, error: "forbidden_origin" });
  if (origin) res.setHeader("Access-Control-Allow-Origin", origin);
  const q = new URL(req.url ?? "", "http://x").searchParams;
  const range = localDayRange(q.get("day") ?? "");
  if (!range) return sendJson(res, 400, { ok: false, error: "bad_day" });
  const step = Number(q.get("step") ?? 300);
  if (!Number.isInteger(step) || step < 60 || step > 3600) return sendJson(res, 400, { ok: false, error: "bad_step" });
  const to = Math.min(range.to, Date.now());
  if (to <= range.from) return sendJson(res, 400, { ok: false, error: "future_day" });
  // Un día de calentamiento: las sesiones abiertas a medianoche empiezan con su estado.
  const events = await readEvents(eventsDir, range.from - 86_400_000, to);
  const titles = new Map(store.list().map((s) => [s.id, s.title]));
  const codex = codexTurns ? { sessions: new Map(store.list().filter((s) => s.agent === "codex").map((s) => [s.id, s])), turns: codexTurns() } : undefined;
  sendJson(res, 200, buildHistory(events, range.from, to, { stepMs: step * 1000, idleMs, titles, codex }));
}

export function createServer(options: ServerOptions = {}): http.Server {
  const eventsDir =
    options.eventsDir ?? path.join(process.env.CIUDAD_DATA_DIR ?? path.join(REPO_ROOT, "data"), "events");
  const idleMs = options.idleMs ?? idleMsFromEnv();
  const store = options.store ?? createSessionStore({ idleMs });
  const reader = createTranscriptReader({ root: options.transcriptsDir });
  const prices = options.prices ?? loadPrices();
  const usageFile = options.usageFile ?? (options.coldStart ? path.join(process.env.CIUDAD_DATA_DIR ?? path.join(REPO_ROOT, "data"), "usage.json") : false);
  const usage = createUsageStore(usageFile || undefined);
  if (options.coldStart) {
    const root = options.transcriptsDir ?? process.env.CIUDAD_TRANSCRIPTS_DIR ?? DEFAULT_TRANSCRIPTS_DIR;
    void coldStart(store, reader, prices, root, new Date(), claudeDaysFromEnv() * 86_400_000).then((n) => console.log(`[collector] arranque en frío: ${n} sesiones`));
  }

  // Carpetas cuyos transcripts se pueden mandar a la papelera: las de Claude y, si se lee, la de Codex.
  const transcriptRoots = [options.transcriptsDir ?? process.env.CIUDAD_TRANSCRIPTS_DIR ?? DEFAULT_TRANSCRIPTS_DIR];
  const codexRoot = options.codexDir ?? (options.coldStart ? process.env.CIUDAD_CODEX_DIR ?? DEFAULT_CODEX_DIR : false);
  if (codexRoot) transcriptRoots.push(path.join(codexRoot, "sessions"));

  // Sondeo de Codex (si se leen sus rollouts): también da sus turnos a Rebobinar.
  let codexPoll: ReturnType<typeof createCodexPoller> | undefined;
  const server = http.createServer((req, res) => {
    if (req.method === "GET" && req.url === "/health") {
      const body: HealthResponse = { ok: true, service: "collector" };
      return sendJson(res, 200, body);
    }
    if (req.method === "GET" && req.url === "/sessions") {
      return sendJson(res, 200, store.list());
    }
    if (req.method === "GET" && req.url?.startsWith("/history?")) {
      return void handleHistory(req, res, eventsDir, store, idleMs, codexPoll?.turns).catch((err) => {
        console.error("[collector] error en /history", err);
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: "internal" });
      });
    }
    const action = req.url?.match(/^\/sessions\/([^/?#]+)\/(reviewed|open|new|delete)$/);
    if (action) {
      let id: string;
      try {
        id = decodeURIComponent(action[1]);
      } catch {
        // Un id mal codificado (p. ej., %E0) no debe tumbar el colector.
        return sendJson(res, 400, { ok: false, error: "bad_id" });
      }
      if (action[2] === "reviewed") return handleReviewed(req, res, store, id);
      if (action[2] === "new") return void handleNew(req, res, store, id, options.startSession ?? startSession);
      if (action[2] === "delete") return void handleDelete(req, res, store, id, transcriptRoots, options.trashDir);
      return void handleOpen(req, res, store, id, options.openSession ?? openSession);
    }
    if (req.url === "/usage/claude") {
      return void handleClaudeUsage(req, res, usage, store).catch((err) => {
        console.error("[collector] error en /usage/claude", err);
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: "internal" });
      });
    }
    if (req.url === "/hook" || req.url?.startsWith("/hook?")) {
      return void handleHook(req, res, eventsDir, store, reader, prices).catch((err) => {
        console.error("[collector] error en /hook", err);
        if (!res.headersSent) sendJson(res, 500, { ok: false, error: "internal" });
      });
    }
    sendJson(res, 404, { ok: false, error: "not_found" });
  });

  const codexDir = options.codexDir ?? (options.coldStart ? process.env.CIUDAD_CODEX_DIR ?? DEFAULT_CODEX_DIR : false);
  if (codexDir) {
    const poll = createCodexPoller(store, codexDir, prices, idleMs, codexDaysFromEnv(), usage);
    codexPoll = poll;
    void poll().then(() => console.log(`[collector] Codex: ${store.list().filter((s) => s.agent === "codex").length} sesiones`));
    const codexTimer = setInterval(() => void poll(), options.codexPollMs ?? 3000);
    codexTimer.unref();
    server.on("close", () => clearInterval(codexTimer));
  }

  const tickMs = options.tickMs ?? Math.min(30_000, idleMs / 2);
  const timer = setInterval(() => {
    try {
      store.tick(new Date());
      for (const s of store.list()) if (s.agent !== "codex") void refreshMetrics(store, reader, prices, s.id);
    } catch (err) {
      console.error("[collector] error revisando la inactividad", err);
    }
  }, tickMs);
  timer.unref();
  server.on("close", () => clearInterval(timer));

  if (options.ws !== false) attachWsHub(server, store, usage);
  return server;
}
