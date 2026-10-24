import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

/** Dónde se abrió: en la app de escritorio o, como respaldo, en Terminal. */
export type OpenedIn = "desktop" | "terminal";
export type SessionOpener = (target: { id: string; cwd: string; agent?: "claude" | "codex" }) => Promise<OpenedIn>;

/** Solo ids de transcript (UUID): nunca se mete texto libre en el comando. */
export const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Ids de la app de escritorio que acepta `claude://code/continue`. */
export const DESKTOP_ID = /^local_[A-Za-z0-9-]{1,64}$/;

/** Carpeta de sesiones de la app de escritorio de Claude en cada sistema (en Linux no hay app: no existirá). */
export function desktopSessionsDir(platform: NodeJS.Platform = process.platform, env = process.env, home = os.homedir()): string {
  if (platform === "darwin") return path.join(home, "Library/Application Support/Claude/claude-code-sessions");
  if (platform === "win32") return path.join(env.APPDATA ?? path.join(home, "AppData", "Roaming"), "Claude", "claude-code-sessions");
  return path.join(env.XDG_CONFIG_HOME ?? path.join(home, ".config"), "Claude", "claude-code-sessions");
}

export const DEFAULT_DESKTOP_SESSIONS_DIR = desktopSessionsDir();

/**
 * Busca el id `local_…` de la app de escritorio para un id de transcript. Formato interno de la app
 * (`<cuenta>/<org>/local_<id>.json`): de cada archivo solo se usan `sessionId` y `cliSessionId`.
 * Si el formato cambia o no hay archivo, devuelve null y se usa Terminal.
 */
export async function findDesktopSession(cliSessionId: string, root = DEFAULT_DESKTOP_SESSIONS_DIR): Promise<string | null> {
  const files: string[] = [];
  try {
    for (const account of await fs.readdir(root)) {
      for (const org of await fs.readdir(path.join(root, account)).catch(() => [])) {
        const dir = path.join(root, account, org);
        for (const name of await fs.readdir(dir).catch(() => [])) if (/^local_.*\.json$/.test(name)) files.push(path.join(dir, name));
      }
    }
  } catch {
    return null;
  }
  for (const file of files) {
    try {
      const { sessionId, cliSessionId: cli } = JSON.parse(await fs.readFile(file, "utf8")) as { sessionId?: unknown; cliSessionId?: unknown };
      if (cli === cliSessionId && typeof sessionId === "string" && DESKTOP_ID.test(sessionId)) return sessionId;
    } catch {
      // Archivo a medio escribir o ajeno: se ignora.
    }
  }
  return null;
}

/** Comilla simple de shell: 'a'\''b'. */
export function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

/** Orden para la terminal: entrar en la carpeta del proyecto y reanudar la conversación. */
export function resumeCommand(id: string, cwd: string, agent: "claude" | "codex" = "claude"): string {
  if (!SESSION_ID.test(id)) throw new Error("id de sesión no válido");
  return agent === "codex" ? `cd ${shellQuote(cwd)} && codex resume ${id}` : `cd ${shellQuote(cwd)} && claude --resume ${id}`;
}

/** Carpeta entre comillas para `cmd.exe`. Se rechazan los caracteres que cmd interpreta incluso entre comillas. */
export function winQuote(dir: string): string {
  if (/["%^&|<>\r\n]/.test(dir)) throw new Error("carpeta no válida para cmd");
  return `"${dir}"`;
}

/** Orden equivalente a `resumeCommand` para `cmd.exe` (Windows). */
export function winResumeCommand(id: string, cwd: string, agent: "claude" | "codex" = "claude"): string {
  if (!SESSION_ID.test(id)) throw new Error("id de sesión no válido");
  return `cd /d ${winQuote(cwd)} && ${agent === "codex" ? `codex resume ${id}` : `claude --resume ${id}`}`;
}

/**
 * Programas que abren una terminal nueva con la orden, por orden de preferencia. macOS: Terminal (AppleScript).
 * Windows: una ventana de cmd. Linux: el emulador por defecto de Debian/Ubuntu y, si no está, GNOME, KDE o xterm;
 * al terminar la orden queda un shell abierto.
 */
export function terminalLaunchers(command: { unix: string; win: string }, platform: NodeJS.Platform = process.platform): [string, string[]][] {
  if (platform === "darwin") return [["osascript", ["-e", terminalScript(command.unix)]]];
  if (platform === "win32") return [["cmd", ["/c", "start", "", "cmd", "/k", command.win]]];
  const keep = `${command.unix}; exec "\${SHELL:-sh}"`;
  return [
    ["x-terminal-emulator", ["-e", "sh", "-c", keep]],
    ["gnome-terminal", ["--", "sh", "-c", keep]],
    ["konsole", ["-e", "sh", "-c", keep]],
    ["xterm", ["-e", "sh", "-c", keep]],
  ];
}

/** Programa que abre un enlace (`claude://`, `codex://`) con la app registrada en cada sistema. */
export function openUrlArgs(url: string, platform: NodeJS.Platform = process.platform): [string, string[]] {
  if (platform === "darwin") return ["open", [url]];
  // En Windows, sin pasar por cmd (que interpretaría & o %): el manejador de enlaces del propio sistema.
  if (platform === "win32") return ["rundll32", ["url.dll,FileProtocolHandler", url]];
  return ["xdg-open", [url]];
}

/** Prueba cada programa hasta que uno funcione. */
async function runFirst(launchers: [string, string[]][]): Promise<void> {
  let last: unknown;
  for (const [cmd, args] of launchers) {
    try {
      return await run(cmd, args);
    } catch (err) {
      last = err;
    }
  }
  throw last ?? new Error("no hay terminal disponible");
}

const openUrlDefault = (url: string) => run(...openUrlArgs(url));

/** AppleScript que abre una ventana nueva de Terminal con la orden. */
export function terminalScript(command: string): string {
  const quoted = command.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `tell application "Terminal"\nactivate\ndo script "${quoted}"\nend tell`;
}

/** Enlace de la app de escritorio que lleva a una sesión ya existente (no la duplica). */
export function desktopUrl(localId: string): string {
  if (!DESKTOP_ID.test(localId)) throw new Error("id de escritorio no válido");
  return `claude://code/continue?session=${localId}`;
}

/** Enlace de la app de escritorio de Codex que abre un hilo existente (`codex://threads/<id>`). */
export function codexDesktopUrl(id: string): string {
  if (!SESSION_ID.test(id)) throw new Error("id de sesión no válido");
  return `codex://threads/${id}`;
}

const run = (cmd: string, args: string[]) =>
  new Promise<void>((resolve, reject) => execFile(cmd, args, { timeout: 10_000 }, (err) => (err ? reject(err) : resolve())));

/** Abre una terminal nueva con `claude --resume <id>` (o `codex resume <id>`) en la carpeta de la sesión. */
export const openInTerminal = async ({ id, cwd, agent }: { id: string; cwd: string; agent?: "claude" | "codex" }): Promise<OpenedIn> => {
  const command = process.platform === "win32" ? { unix: "", win: winResumeCommand(id, cwd, agent) } : { unix: resumeCommand(id, cwd, agent), win: "" };
  await runFirst(terminalLaunchers(command));
  return "terminal";
};

/** Primero la app de escritorio; si la sesión no está en ella (o falla), Terminal. */
export function createOpener(root = DEFAULT_DESKTOP_SESSIONS_DIR, terminal = openInTerminal, openUrl: (url: string) => Promise<void> = openUrlDefault): SessionOpener {
  return async (target) => {
    if (target.agent === "codex") {
      try {
        await openUrl(codexDesktopUrl(target.id));
        return "desktop";
      } catch (err) {
        console.error("[collector] no se pudo abrir la app de Codex; uso Terminal", err);
        return terminal(target);
      }
    }
    const localId = await findDesktopSession(target.id, root);
    if (localId) {
      try {
        await openUrl(desktopUrl(localId));
        return "desktop";
      } catch (err) {
        console.error("[collector] no se pudo abrir la app de escritorio; uso Terminal", err);
      }
    }
    return terminal(target);
  };
}

export const openSession: SessionOpener = createOpener();

/** Abre una sesión nueva en la carpeta del proyecto. */
export type SessionStarter = (target: { root: string; agent?: "claude" | "codex" }) => Promise<OpenedIn>;

/** Enlace de la app de escritorio que abre una sesión nueva en una carpeta (Claude o Codex). */
export function newSessionUrl(root: string, agent: "claude" | "codex" = "claude"): string {
  if (!path.isAbsolute(root)) throw new Error("carpeta no válida");
  const folder = encodeURIComponent(root);
  return agent === "codex" ? `codex://threads/new?path=${folder}` : `claude://code/new?folder=${folder}`;
}

/** Orden de respaldo para Terminal: entrar en la carpeta y arrancar el agente. */
export function newSessionCommand(root: string, agent: "claude" | "codex" = "claude"): string {
  return `cd ${shellQuote(root)} && ${agent === "codex" ? "codex" : "claude"}`;
}

/** Primero la app de escritorio; si falla, Terminal. */
export function createStarter(
  openUrl: (url: string) => Promise<void> = openUrlDefault,
  terminal = async (command: string, target: { root: string; agent?: "claude" | "codex" }) => {
    const win = `cd /d ${winQuote(target.root)} && ${target.agent === "codex" ? "codex" : "claude"}`;
    await runFirst(terminalLaunchers(process.platform === "win32" ? { unix: "", win } : { unix: command, win: "" }));
  },
): SessionStarter {
  return async ({ root, agent }) => {
    try {
      await openUrl(newSessionUrl(root, agent));
      return "desktop";
    } catch (err) {
      console.error("[collector] no se pudo abrir la app para una sesión nueva; uso Terminal", err);
      await terminal(newSessionCommand(root, agent), { root, agent });
      return "terminal";
    }
  };
}

export const startSession: SessionStarter = createStarter();
