import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

export const DEFAULT_TRASH_DIR = path.join(os.homedir(), ".Trash");

/** Papelera de Linux según la especificación de freedesktop.org (la que usan GNOME, KDE y demás). */
export function linuxTrashDir(env = process.env, home = os.homedir()): string {
  return path.join(env.XDG_DATA_HOME ?? path.join(home, ".local", "share"), "Trash");
}

/** Contenido del `.trashinfo` que permite restaurar un archivo desde la papelera de Linux. */
export function trashInfo(original: string, at: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const date = `${at.getFullYear()}-${p(at.getMonth() + 1)}-${p(at.getDate())}T${p(at.getHours())}:${p(at.getMinutes())}:${p(at.getSeconds())}`;
  const encoded = original.split("/").map(encodeURIComponent).join("/");
  return `[Trash Info]\nPath=${encoded}\nDeletionDate=${date}\n`;
}

/** Windows: la Papelera de reciclaje con PowerShell. La ruta va por variable de entorno, nunca dentro del script. */
function recycleOnWindows(src: string, isDir: boolean): Promise<void> {
  const verb = isDir ? "DeleteDirectory" : "DeleteFile";
  const script = `Add-Type -AssemblyName Microsoft.VisualBasic; [Microsoft.VisualBasic.FileIO.FileSystem]::${verb}($env:CIUDAD_TRASH_PATH, 'OnlyErrorDialogs', 'SendToRecycleBin')`;
  return new Promise((resolve, reject) =>
    execFile("powershell", ["-NoProfile", "-NonInteractive", "-Command", script], { timeout: 20_000, env: { ...process.env, CIUDAD_TRASH_PATH: src } }, (err) => (err ? reject(err) : resolve())),
  );
}

/** ¿`file` está dentro de alguna de las carpetas permitidas (sin salir con `..` ni enlaces)? */
export async function isInside(file: string, roots: string[]): Promise<boolean> {
  let real: string;
  try {
    real = await fs.realpath(file);
  } catch {
    return false;
  }
  for (const root of roots) {
    let r: string;
    try {
      r = await fs.realpath(root);
    } catch {
      continue;
    }
    const rel = path.relative(r, real);
    if (rel && !rel.startsWith("..") && !path.isAbsolute(rel)) return true;
  }
  return false;
}

/** Nombre libre en la papelera: `nombre`, `nombre 2`, `nombre 3`… */
async function freeName(trash: string, name: string): Promise<string> {
  const ext = path.extname(name), base = name.slice(0, name.length - ext.length);
  for (let i = 1; ; i++) {
    const candidate = path.join(trash, i === 1 ? name : `${base} ${i}${ext}`);
    try {
      await fs.access(candidate);
    } catch {
      return candidate;
    }
  }
}

/**
 * Mueve el transcript de una sesión a la papelera del sistema (recuperable), junto a su carpeta hermana
 * de Claude (`<id>/`: subagentes y resultados) si existe. Solo dentro de `roots`. Devuelve las rutas movidas.
 * Con `trash` explícito (tests o `trashDir`) se mueve a esa carpeta tal cual; si no: ~/.Trash en macOS, la
 * papelera de freedesktop en Linux y la Papelera de reciclaje en Windows.
 */
export async function moveSessionToTrash(file: string, roots: string[], trash?: string, platform: NodeJS.Platform = process.platform): Promise<string[]> {
  if (!file.endsWith(".jsonl") || !(await isInside(file, roots))) throw new Error("transcript fuera de las carpetas permitidas");
  if (!trash && platform === "win32") {
    const moved: string[] = [];
    for (const src of [file, file.slice(0, -".jsonl".length)]) {
      const st = await fs.stat(src).catch(() => null);
      if (!st || (src !== file && !(await isInside(src, roots)))) continue;
      await recycleOnWindows(src, st.isDirectory());
      moved.push(src);
    }
    return moved;
  }
  const linux = !trash && platform !== "darwin";
  const base = trash ?? (linux ? linuxTrashDir() : DEFAULT_TRASH_DIR);
  return moveInto(file, roots, linux ? path.join(base, "files") : base, linux ? path.join(base, "info") : undefined);
}

async function moveInto(file: string, roots: string[], trash: string, infoDir?: string): Promise<string[]> {
  await fs.mkdir(trash, { recursive: true });
  if (infoDir) await fs.mkdir(infoDir, { recursive: true });
  const moved: string[] = [];
  const sibling = file.slice(0, -".jsonl".length);
  for (const src of [file, sibling]) {
    try {
      await fs.access(src);
    } catch {
      continue;
    }
    if (src === sibling && !(await isInside(src, roots))) continue;
    const dest = await freeName(trash, path.basename(src));
    if (infoDir) await fs.writeFile(path.join(infoDir, `${path.basename(dest)}.trashinfo`), trashInfo(src, new Date()));
    await fs.rename(src, dest);
    moved.push(dest);
  }
  return moved;
}
