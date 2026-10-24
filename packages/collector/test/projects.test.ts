import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, mkdirSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { resolveProject } from "../src/projects.ts";
import { createSessionStore } from "../src/sessions.ts";

const dirs: string[] = [];
function fixture() {
  const root = mkdtempSync(path.join(os.tmpdir(), "ciudad-projects-"));
  dirs.push(root);
  const repo = path.join(root, "principal");
  mkdirSync(path.join(repo, ".git", "worktrees", "rama"), { recursive: true });
  mkdirSync(path.join(repo, "src", "web"), { recursive: true });
  const worktree = path.join(root, "rama-externa");
  mkdirSync(worktree);
  writeFileSync(path.join(worktree, ".git"), `gitdir: ${repo}/.git/worktrees/rama\n`);
  writeFileSync(path.join(repo, ".git", "worktrees", "rama", "commondir"), "../..\n");
  return { root, repo, worktree };
}
afterEach(() => { for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true }); });

describe("identidad de proyecto/agente", () => {
  it("la raíz, sus subcarpetas y un worktree externo tienen el mismo proyecto", () => {
    const { repo, worktree } = fixture();
    const main = resolveProject(repo);
    expect(main.name).toBe("principal");
    expect(resolveProject(path.join(repo, "src", "web"))).toEqual(main);
    expect(resolveProject(worktree)).toEqual(main);
  });

  it("dos repositorios homónimos no se mezclan, ni aunque se acceda por un enlace", () => {
    const { root, repo } = fixture();
    const other = path.join(root, "otra", "principal");
    mkdirSync(path.join(other, ".git"), { recursive: true });
    const alias = path.join(root, "alias");
    symlinkSync(repo, alias);
    expect(resolveProject(other).name).toBe(resolveProject(repo).name);
    expect(resolveProject(other).id).not.toBe(resolveProject(repo).id);
    expect(resolveProject(alias)).toEqual(resolveProject(repo));
  });

  it("sin Git, con carpeta ausente o metadatos inválidos no pierde la sesión", () => {
    const { root } = fixture();
    const folder = path.join(root, "sin-git");
    mkdirSync(folder);
    writeFileSync(path.join(folder, ".git"), "incompleto");
    expect(resolveProject(folder)).toMatchObject({ name: "sin-git", id: expect.stringMatching(/^folder:/) });
    expect(resolveProject(path.join(root, "borrada")).name).toBe("borrada");
    expect(resolveProject()).toEqual({ id: "unknown", name: "Sin proyecto" });
  });
});

describe("pisos dentro de cada edificio", () => {
  it("cada proyecto empieza en 0; cerrar, cambiar de estado y reconectar no mueve otros pisos", () => {
    const { root, repo, worktree } = fixture();
    const other = path.join(root, "otro");
    mkdirSync(path.join(other, ".git"), { recursive: true });
    const store = createSessionStore();
    const now = new Date("2026-10-19T10:00:00Z");
    const event = (id: string, cwd: string, name = "SessionStart") => store.apply({ session_id: id, cwd, hook_event_name: name }, now);
    const received: unknown[] = [];
    store.subscribe((msg) => received.push(msg));
    event("a", repo);
    event("b", other);
    event("c", worktree);
    expect(store.get("a")?.projectFloor).toBe(0);
    expect(store.get("b")?.projectFloor).toBe(0);
    expect(store.get("c")?.projectFloor).toBe(1);
    expect(store.get("c")?.project).toEqual(store.get("a")?.project);
    event("a", repo, "SessionEnd");
    event("c", worktree, "PermissionRequest");
    event("c", worktree, "SessionStart");
    expect(store.get("c")).toMatchObject({ projectFloor: 1, state: "te_necesita" });
    event("d", repo);
    expect(store.get("d")?.projectFloor).toBe(0);
    expect(received.at(-1)).toMatchObject({ type: "session", session: { id: "d", projectFloor: 0, project: store.get("c")?.project } });
    expect(JSON.parse(JSON.stringify(store.list())).find((s: { id: string }) => s.id === "c").projectFloor).toBe(1);
    // Si cambia de repo, se integra en el destino sin colisionar con su planta 0.
    event("c", other, "UserPromptSubmit");
    expect(store.get("c")).toMatchObject({ projectFloor: 1, project: store.get("b")?.project });
  });

  it("el arranque en frío asigna el edificio y los pisos con el mismo criterio que los hooks", () => {
    const { repo, worktree } = fixture();
    const store = createSessionStore();
    const lastEventAt = new Date("2026-10-19T10:00:00Z");
    for (const [id, cwd] of [["a", repo], ["b", worktree]]) {
      store.seed({ id, cwd, title: id, transcriptPath: "/inventado.jsonl", lastEventAt });
    }
    expect(store.get("a")?.project).toEqual(store.get("b")?.project);
    expect(store.list().map((s) => s.projectFloor)).toEqual([0, 1]);
    expect(store.list().every((s) => s.state === "dormida")).toBe(true);
  });
});
