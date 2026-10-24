import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type http from "node:http";
import { createServer } from "../src/server.ts";
import { createSessionStore } from "../src/sessions.ts";
import { createOpener, desktopUrl, findDesktopSession, resumeCommand, shellQuote, terminalScript } from "../src/openSession.ts";

const T0 = new Date("2026-10-20T10:00:00Z");
const ID = "0f8e2c1a-1111-4222-8333-944455556666";

describe("orden de reanudar", () => {
  it("cita la carpeta y rechaza ids que no son UUID", () => {
    expect(resumeCommand(ID, "/tmp/mi proyecto")).toBe(`cd '/tmp/mi proyecto' && claude --resume ${ID}`);
    expect(shellQuote("a'b")).toBe(`'a'\\''b'`);
    expect(() => resumeCommand("x; rm -rf /", "/tmp")).toThrow();
  });
  it("escapa comillas y barras para AppleScript", () => {
    expect(terminalScript(`echo "a\\b"`)).toContain(`do script "echo \\"a\\\\b\\""`);
  });
});

describe("POST /sessions/:id/open", () => {
  let server: http.Server;
  let base: string;
  let dir: string;
  const opened: Array<{ id: string; cwd: string }> = [];
  const local = { origin: "http://localhost:5173" };

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-open-"));
    const store = createSessionStore();
    store.apply({ hook_event_name: "UserPromptSubmit", session_id: ID, cwd: "/tmp/proyecto" }, T0);
    store.apply({ hook_event_name: "UserPromptSubmit", session_id: "sin-uuid", cwd: "/tmp/proyecto" }, T0);
    opened.length = 0;
    server = createServer({ store, eventsDir: dir, ws: false, openSession: async (t) => { opened.push(t); return "desktop"; } });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    await new Promise((ok) => server.close(ok));
    await fs.rm(dir, { recursive: true, force: true });
  });

  it("abre la sesión conocida con su carpeta", async () => {
    const res = await fetch(`${base}/sessions/${ID}/open`, { method: "POST", headers: local });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, openedIn: "desktop" });
    expect(opened).toEqual([{ id: ID, cwd: "/tmp/proyecto" }]);
  });

  it("exige un Origin local y una sesión reanudable", async () => {
    expect((await fetch(`${base}/sessions/${ID}/open`, { method: "POST" })).status).toBe(403);
    expect((await fetch(`${base}/sessions/${ID}/open`, { method: "POST", headers: { origin: "https://evil.example" } })).status).toBe(403);
    expect((await fetch(`${base}/sessions/no-existe/open`, { method: "POST", headers: local })).status).toBe(404);
    expect((await fetch(`${base}/sessions/sin-uuid/open`, { method: "POST", headers: local })).status).toBe(422);
    expect(opened).toEqual([]);
  });
});

describe("app de escritorio", () => {
  let root: string;
  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-desk-"));
    const dir = path.join(root, "cuenta", "org");
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, "local_abc-1.json"), JSON.stringify({ sessionId: "local_abc-1", cliSessionId: ID, title: "no se usa" }));
    await fs.writeFile(path.join(dir, "local_roto.json"), "{a medio escribir");
    await fs.writeFile(path.join(dir, "local_malo.json"), JSON.stringify({ sessionId: "local_x; rm", cliSessionId: "otro" }));
  });
  afterEach(() => fs.rm(root, { recursive: true, force: true }));

  it("encuentra el id local_ por cliSessionId e ignora archivos rotos", async () => {
    expect(await findDesktopSession(ID, root)).toBe("local_abc-1");
    expect(await findDesktopSession("otro", root)).toBeNull();
    expect(await findDesktopSession(ID, path.join(root, "no-existe"))).toBeNull();
    expect(desktopUrl("local_abc-1")).toBe("claude://code/continue?session=local_abc-1");
  });

  it("abre la app si la sesión está en ella y, si no o si falla, Terminal", async () => {
    const urls: string[] = [], terminal: string[] = [];
    const term = async (t: { id: string }) => { terminal.push(t.id); return "terminal" as const; };
    const opener = createOpener(root, term, async (url) => { urls.push(url); });
    expect(await opener({ id: ID, cwd: "/tmp" })).toBe("desktop");
    expect(await opener({ id: "1f8e2c1a-1111-4222-8333-944455556666", cwd: "/tmp" })).toBe("terminal");
    const failing = createOpener(root, term, async () => { throw new Error("sin app"); });
    expect(await failing({ id: ID, cwd: "/tmp" })).toBe("terminal");
    expect(urls).toEqual(["claude://code/continue?session=local_abc-1"]);
    expect(terminal).toHaveLength(2);
  });

  it("Codex abre su hilo en la app de Codex y, si falla, Terminal", async () => {
    const urls: string[] = [], terminal: string[] = [];
    const term = async (t: { id: string }) => { terminal.push(t.id); return "terminal" as const; };
    const opener = createOpener(root, term, async (url) => { urls.push(url); });
    expect(await opener({ id: ID, cwd: "/tmp", agent: "codex" })).toBe("desktop");
    expect(urls).toEqual([`codex://threads/${ID}`]);
    const failing = createOpener(root, term, async () => { throw new Error("sin app"); });
    expect(await failing({ id: ID, cwd: "/tmp", agent: "codex" })).toBe("terminal");
    expect(terminal).toEqual([ID]);
  });
});
