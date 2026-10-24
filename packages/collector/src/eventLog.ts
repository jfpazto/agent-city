import { appendFile, mkdir, readdir, rm } from "node:fs/promises";
import path from "node:path";

// Campos de metadatos que se guardan tal cual. Prompts, tool_input, tool_response y demás
// contenido solo quedan como nombre de campo, salvo con CIUDAD_EVENTS_FULL=1 (para sondear formatos).
const KEEP = new Set([
  "hook_event_name",
  "session_id",
  "cwd",
  "transcript_path",
  "permission_mode",
  "tool_name",
  "tool_use_id",
  "notification_type",
  "source",
  "reason",
  "stop_hook_active",
  "agent_id",
  "agent_type",
  "turn_id",
  "model",
  "trigger",
]);

export function redactEvent(event: unknown): unknown {
  if (!event || typeof event !== "object" || Array.isArray(event)) return event;
  const kept: Record<string, unknown> = {};
  const omitted: string[] = [];
  for (const [key, value] of Object.entries(event)) {
    if (KEEP.has(key) && (value === null || typeof value !== "object")) kept[key] = value;
    else omitted.push(key);
  }
  if (omitted.length > 0) kept.omitted = omitted;
  return kept;
}

export function eventsDaysFromEnv(value = process.env.CIUDAD_EVENTS_DAYS): number {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : 7;
}

const prunedOn = new Map<string, string>();

/** Borra los archivos diarios con más de `days` días. Una vez al día por carpeta. */
export async function pruneEvents(dir: string, days: number, now = new Date()): Promise<void> {
  const today = now.toISOString().slice(0, 10);
  if (prunedOn.get(dir) === today) return;
  prunedOn.set(dir, today);
  const cutoff = new Date(now.getTime() - days * 86_400_000).toISOString().slice(0, 10);
  for (const name of await readdir(dir)) {
    const m = /^(\d{4}-\d{2}-\d{2})\.jsonl$/.exec(name);
    if (m && m[1] < cutoff) await rm(path.join(dir, name), { force: true });
  }
}

export async function appendEvent(
  dir: string,
  event: unknown,
  now = new Date(),
  { full = process.env.CIUDAD_EVENTS_FULL === "1", days = eventsDaysFromEnv(), agent = "claude" } = {},
): Promise<string> {
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${now.toISOString().slice(0, 10)}.jsonl`);
  const stored = full ? event : redactEvent(event);
  await appendFile(file, JSON.stringify({ receivedAt: now.toISOString(), agent, event: stored }) + "\n");
  await pruneEvents(dir, days, now).catch(() => {});
  return file;
}
