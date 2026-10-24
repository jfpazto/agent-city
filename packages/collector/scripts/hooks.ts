import { copyFile, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const MARKER = "ciudad-de-agentes";
export const EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "Notification",
  "PermissionRequest",
  "Stop",
  "SubagentStop",
  "SessionEnd",
] as const;
// Eventos de Codex CLI 0.163.0 (cadenas del binario). No tiene Notification ni PostToolUseFailure.
export const CODEX_EVENTS = [
  "SessionStart",
  "UserPromptSubmit",
  "PreToolUse",
  "PermissionRequest",
  "PostToolUse",
  "PreCompact",
  "PostCompact",
  "SubagentStart",
  "SubagentStop",
  "Stop",
  "Interrupt",
  "SessionEnd",
] as const;
const TOOL_EVENTS = new Set(["PreToolUse", "PostToolUse", "PostToolUseFailure", "PermissionRequest"]);

type HookCmd = { type: string; command?: string; timeout?: number };
type HookGroup = { matcher?: string; hooks: HookCmd[] };
type StatusLine = { type: string; command?: string; padding?: number };
type Settings = { hooks?: Record<string, HookGroup[]>; statusLine?: StatusLine; [k: string]: unknown };

const isOurs = (h: HookCmd) => typeof h.command === "string" && h.command.includes(MARKER);

export function addHooks(settings: Settings, command: string, events: readonly string[] = EVENTS): Settings {
  const out: Settings = structuredClone(settings);
  out.hooks ??= {};
  for (const event of events) {
    const groups = (out.hooks[event] ??= []);
    if (groups.some((g) => g.hooks?.some(isOurs))) continue;
    const group: HookGroup = { hooks: [{ type: "command", command: `${command} # ${MARKER}`, timeout: 2 }] };
    if (TOOL_EVENTS.has(event)) group.matcher = "*";
    groups.push(group);
  }
  return out;
}

export function removeHooks(settings: Settings): Settings {
  const out: Settings = structuredClone(settings);
  if (!out.hooks) return out;
  for (const [event, groups] of Object.entries(out.hooks)) {
    const kept = groups
      .map((g) => ({ ...g, hooks: (g.hooks ?? []).filter((h) => !isOurs(h)) }))
      .filter((g) => g.hooks.length > 0);
    if (kept.length > 0) out.hooks[event] = kept;
    else delete out.hooks[event];
  }
  return out;
}

/** Instala la statusline solo si no hay otra: una statusline ajena nunca se pisa. */
export function addStatusLine(settings: Settings, command: string): { settings: Settings; installed: boolean } {
  const out: Settings = structuredClone(settings);
  if (out.statusLine && !isOurs(out.statusLine)) return { settings: out, installed: false };
  out.statusLine = { type: "command", command: `${command} # ${MARKER}`, padding: 0 };
  return { settings: out, installed: true };
}

export function removeStatusLine(settings: Settings): Settings {
  const out: Settings = structuredClone(settings);
  if (out.statusLine && isOurs(out.statusLine)) delete out.statusLine;
  return out;
}

/** Lee settings.json; si no existe (usuario nuevo de Claude Code) parte de un objeto vacío. */
export async function readSettings(file: string): Promise<{ settings: Settings; existed: boolean }> {
  try {
    return { settings: JSON.parse(await readFile(file, "utf8")), existed: true };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return { settings: {}, existed: false };
    throw err;
  }
}

type Target = "claude" | "codex";

/** Orden de un hook: el script de sh (curl) en macOS y Linux; en Windows, su equivalente en Node. */
export function hookCommand(hookDir: string, name: "send" | "statusline", platform: NodeJS.Platform = process.platform): string {
  return platform === "win32" ? `node "${path.join(hookDir, `${name}.mjs`)}"` : `"${path.join(hookDir, `${name}.sh`)}"`;
}

async function main() {
  const mode = process.argv[2];
  const target: Target = process.argv[3] === "codex" ? "codex" : "claude";
  if ((mode !== "install" && mode !== "uninstall") || (process.argv[3] && process.argv[3] !== target)) {
    console.error("Uso: hooks.ts install|uninstall [claude|codex]");
    process.exit(1);
  }
  const file =
    target === "codex"
      ? process.env.CODEX_HOOKS_PATH ?? path.join(os.homedir(), ".codex", "hooks.json")
      : process.env.CLAUDE_SETTINGS_PATH ?? path.join(os.homedir(), ".claude", "settings.json");
  const { settings: current, existed } = await readSettings(file);
  if (!existed && mode === "uninstall") return console.log(`[hooks] no existe ${file}: nada que desinstalar`);
  const backup = existed ? `${file}.bak-${new Date().toISOString().replace(/[:.]/g, "-")}` : null;
  if (backup) await copyFile(file, backup);
  else await mkdir(path.dirname(file), { recursive: true });

  const hookDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../hook");
  const send = hookCommand(hookDir, "send");
  let next: Settings;
  if (target === "codex") {
    next = mode === "install" ? addHooks(current, `${send} codex`, CODEX_EVENTS) : removeHooks(current);
    // hooks.json de Codex lo creó el instalador: si al desinstalar queda vacío, se borra.
    if (mode === "uninstall" && next.hooks && Object.keys(next.hooks).length === 0) delete next.hooks;
    if (mode === "uninstall" && Object.keys(next).length === 0) {
      await rm(file);
      return console.log(`[hooks] uninstall hecho: ${file} quedó vacío y se borró (copia: ${backup})`);
    }
  } else if (mode === "install") {
    const status = addStatusLine(addHooks(current, send), hookCommand(hookDir, "statusline"));
    next = status.settings;
    if (!status.installed)
      console.warn(
        `[hooks] ya tienes una statusline propia: no se toca, así que el depósito de Claude no tendrá datos.\n` +
          `        Para tener ambos, haz que tu statusline reenvíe también su entrada a: ${hookCommand(hookDir, "statusline")}`,
      );
  } else next = removeStatusLine(removeHooks(current));

  const tmp = `${file}.tmp-${process.pid}`;
  await writeFile(tmp, JSON.stringify(next, null, 2) + "\n");
  await rename(tmp, file);
  console.log(`[hooks] ${mode} hecho en ${file} (${backup ? `copia: ${backup}` : "archivo nuevo"})`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
