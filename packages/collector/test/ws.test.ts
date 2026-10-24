import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import WebSocket from "ws";
import type { ServerMessage } from "@ciudad/shared";
import { createServer } from "../src/server.ts";
import { isAllowedOrigin } from "../src/wsHub.ts";

let server: Server;
let port: number;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-ws-"));
  server = createServer({ eventsDir: dir });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  port = (server.address() as AddressInfo).port;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(dir, { recursive: true, force: true });
});

const hook = (e: object) =>
  fetch(`http://127.0.0.1:${port}/hook`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(e),
  });

// Cliente que acumula mensajes y permite esperar al siguiente.
function client(origin?: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, origin ? { origin } : {});
  const queue: ServerMessage[] = [];
  const waiters: ((m: ServerMessage) => void)[] = [];
  ws.on("message", (d) => {
    const m = JSON.parse(String(d)) as ServerMessage;
    const w = waiters.shift();
    if (w) w(m);
    else queue.push(m);
  });
  const next = (ms = 500) =>
    new Promise<ServerMessage>((resolve, reject) => {
      const q = queue.shift();
      if (q) return resolve(q);
      const t = setTimeout(() => reject(new Error("timeout")), ms);
      waiters.push((m) => {
        clearTimeout(t);
        resolve(m);
      });
    });
  return { ws, next };
}

describe("WebSocket /ws", () => {
  it("snapshot al conectar, cambios en vivo, retirada y eventos ignorados", async () => {
    await hook({ hook_event_name: "SessionStart", session_id: "A", cwd: "/tmp/a" });
    await hook({ hook_event_name: "SessionStart", session_id: "B", cwd: "/tmp/b" });

    const c = client("http://localhost:5173");
    const snap = await c.next();
    expect(snap.type).toBe("snapshot");
    if (snap.type === "snapshot") expect(snap.sessions.map((s) => [s.id, s.floor])).toEqual([["A", 0], ["B", 1]]);

    const t0 = Date.now();
    await hook({ hook_event_name: "PermissionRequest", session_id: "A", tool_name: "Bash" });
    const change = await c.next();
    expect(Date.now() - t0).toBeLessThan(500);
    expect(change).toMatchObject({ type: "session", session: { id: "A", state: "te_necesita" } });

    await hook({ hook_event_name: "Stop" }); // sin session_id
    await hook({ hook_event_name: "SessionEnd", session_id: "B" });
    expect(await c.next()).toEqual({ type: "removed", id: "B" }); // nada entre medias

    c.ws.close();
  });

  it("rechaza orígenes ajenos con 403", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`, { origin: "https://evil.example" });
    const status = await new Promise<number | undefined>((resolve) => {
      ws.on("unexpected-response", (_req, res) => resolve(res.statusCode));
      ws.on("open", () => resolve(101));
      ws.on("error", () => resolve(undefined));
    });
    expect(status).toBe(403);
  });

  it("server.close termina aunque haya clientes WS abiertos", async () => {
    const dir2 = await mkdtemp(path.join(os.tmpdir(), "ciudad-ws-close-"));
    const srv = createServer({ eventsDir: dir2 });
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const p = (srv.address() as AddressInfo).port;
    const ws = new WebSocket(`ws://127.0.0.1:${p}/ws`);
    await new Promise((r) => ws.once("message", r));
    const t0 = Date.now();
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("server.close colgado")), 1000);
      srv.close(() => {
        clearTimeout(t);
        resolve();
      });
    });
    expect(Date.now() - t0).toBeLessThan(1000);
    await rm(dir2, { recursive: true, force: true });
  });

  it("isAllowedOrigin", () => {
    expect(isAllowedOrigin(undefined)).toBe(true);
    expect(isAllowedOrigin("http://localhost:5173")).toBe(true);
    expect(isAllowedOrigin("http://127.0.0.1:4317")).toBe(true);
    expect(isAllowedOrigin("https://localhost.evil.com")).toBe(false);
    expect(isAllowedOrigin("http://localhost.evil.com")).toBe(false);
    expect(isAllowedOrigin("null")).toBe(false);
    // Otro servidor de desarrollo local no puede abrir, crear ni borrar sesiones.
    expect(isAllowedOrigin("http://localhost:3000")).toBe(false);
    expect(isAllowedOrigin("http://localhost")).toBe(false);
    expect(isAllowedOrigin("http://localhost:3000", new Set(["3000"]))).toBe(true);
  });
});
