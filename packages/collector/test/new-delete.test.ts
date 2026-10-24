import fs from "node:fs/promises";
import type http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createStarter, newSessionCommand, newSessionUrl } from "../src/openSession.ts";
import { createServer } from "../src/server.ts";
import { createSessionStore, type SessionStore } from "../src/sessions.ts";
import { moveSessionToTrash } from "../src/trash.ts";

const ID = "1f8e2c1a-1111-4222-8333-944455556666";
const local = { origin: "http://localhost:5173" };

describe("sesión nueva", () => {
  it("enlaces de la app de Claude y de Codex con la carpeta codificada; respaldo en Terminal", async () => {
    expect(newSessionUrl("/tmp/mi proyecto")).toBe("claude://code/new?folder=%2Ftmp%2Fmi%20proyecto");
    expect(newSessionUrl("/tmp/a", "codex")).toBe("codex://threads/new?path=%2Ftmp%2Fa");
    expect(() => newSessionUrl("relativa")).toThrow();
    expect(newSessionCommand("/tmp/a b", "codex")).toBe("cd '/tmp/a b' && codex");
    const commands: string[] = [];
    const failing = createStarter(async () => { throw new Error("sin app"); }, async (c) => { commands.push(c); });
    expect(await failing({ root: "/tmp/a" })).toBe("terminal");
    expect(commands).toEqual(["cd '/tmp/a' && claude"]);
  });
});

describe("rutas /new y /delete", () => {
  let dir: string, transcripts: string, trash: string, server: http.Server, base: string, store: SessionStore;
  const started: Array<{ root: string; agent?: string }> = [];

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-del-"));
    transcripts = path.join(dir, "projects");
    trash = path.join(dir, "trash");
    await fs.mkdir(path.join(transcripts, "-tmp-alfa", ID), { recursive: true });
    await fs.writeFile(path.join(transcripts, "-tmp-alfa", `${ID}.jsonl`), "{}\n");
    await fs.writeFile(path.join(transcripts, "-tmp-alfa", ID, "sub.jsonl"), "{}\n");
    store = createSessionStore();
    store.seed({ id: ID, title: "t", cwd: "/tmp/alfa", transcriptPath: path.join(transcripts, "-tmp-alfa", `${ID}.jsonl`), lastEventAt: new Date() });
    started.length = 0;
    server = createServer({ store, eventsDir: path.join(dir, "events"), ws: false, transcriptsDir: transcripts, trashDir: trash, codexDir: false,
      startSession: async (t) => { started.push(t); return "desktop"; } });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    await new Promise((ok) => server.close(ok));
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("/new abre una sesión en la carpeta del proyecto, nunca una de la petición", async () => {
    const res = await fetch(`${base}/sessions/${ID}/new`, { method: "POST", headers: local, body: JSON.stringify({ root: "/etc" }) });
    expect(await res.json()).toEqual({ ok: true, openedIn: "desktop" });
    expect(started).toHaveLength(1);
    expect(started[0].root).not.toBe("/etc");
    expect((await fetch(`${base}/sessions/${ID}/new`, { method: "POST" })).status).toBe(403);
  });

  it("/delete manda transcript y carpeta hermana a la papelera y retira la sesión", async () => {
    const res = await fetch(`${base}/sessions/${ID}/delete`, { method: "POST", headers: local });
    expect(res.status).toBe(200);
    expect(store.get(ID)).toBeUndefined();
    expect((await fs.readdir(trash)).sort()).toEqual([ID, `${ID}.jsonl`].sort());
    expect(await fs.readdir(path.join(transcripts, "-tmp-alfa"))).toEqual([]);
  });

  it("/delete no toca una sesión trabajando ni acepta orígenes ajenos", async () => {
    store.apply({ hook_event_name: "UserPromptSubmit", session_id: ID }, new Date());
    expect((await fetch(`${base}/sessions/${ID}/delete`, { method: "POST", headers: local })).status).toBe(409);
    expect((await fetch(`${base}/sessions/${ID}/delete`, { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect(store.get(ID)).toBeDefined();
  });

  it("nunca mueve un archivo fuera de las carpetas permitidas", async () => {
    const outside = path.join(dir, "fuera.jsonl");
    await fs.writeFile(outside, "{}\n");
    await expect(moveSessionToTrash(outside, [transcripts], trash)).rejects.toThrow();
    await expect(moveSessionToTrash(path.join(transcripts, "..", "fuera.jsonl"), [transcripts], trash)).rejects.toThrow();
    await fs.access(outside);
  });
});
