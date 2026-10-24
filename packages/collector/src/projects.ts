import { readFileSync, realpathSync, statSync } from "node:fs";
import path from "node:path";
import type { Project } from "@ciudad/shared";

const canonical = (file: string): string => {
  try { return realpathSync(file); } catch { return path.resolve(file); }
};

/** Solo lee metadatos locales de Git; nunca ejecuta comandos, hooks ni accede a la red. */
export function resolveProject(cwd?: string): Project {
  if (!cwd || !path.isAbsolute(cwd)) return { id: "unknown", name: "Sin proyecto" };
  const folder = canonical(cwd);
  let dir = folder;
  while (true) {
    const marker = path.join(dir, ".git");
    try {
      let gitDir = marker;
      if (!statSync(marker).isDirectory()) {
        const match = readFileSync(marker, "utf8").trim().match(/^gitdir:\s*(.+)$/);
        if (!match) throw new Error("gitdir inválido");
        gitDir = path.resolve(dir, match[1]);
      }
      if (!statSync(gitDir).isDirectory()) throw new Error("gitdir ausente");
      let common = gitDir;
      try { common = path.resolve(gitDir, readFileSync(path.join(gitDir, "commondir"), "utf8").trim()); } catch { /* repositorio principal */ }
      common = canonical(common);
      // Un worktree apunta al .git del checkout principal, aunque viva fuera de él.
      const root = path.basename(common) === ".git" ? path.dirname(common) : dir;
      return { id: `git:${common}`, name: path.basename(root) || root, root };
    } catch { /* Sin metadatos aquí: buscar en la carpeta padre. */ }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return { id: `folder:${folder}`, name: path.basename(folder) || folder, root: folder };
}

/** El store conserva la identidad: el coste del recorrido se paga una vez por carpeta. */
export function createProjectResolver(): (cwd?: string) => Project {
  const cache = new Map<string, Project>();
  return (cwd) => {
    const key = cwd ?? "";
    const cached = cache.get(key);
    if (cached) return cached;
    const project = resolveProject(cwd);
    cache.set(key, project);
    return project;
  };
}
