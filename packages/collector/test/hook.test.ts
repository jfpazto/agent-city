import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createServer } from "../src/server.ts";

let server: Server;
let base: string;
let dir: string;

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-events-"));
  server = createServer({ eventsDir: dir });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(dir, { recursive: true, force: true });
});

const post = (body: string) =>
  fetch(`${base}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body });

describe("POST /hook", () => {
  it("guarda el evento en el archivo del día", async () => {
    const event = { hook_event_name: "Stop", session_id: "s1" };
    const res = await post(JSON.stringify(event));
    expect(res.status).toBe(204);
    const [file] = await readdir(dir);
    expect(file).toMatch(/^\d{4}-\d{2}-\d{2}\.jsonl$/);
    const line = JSON.parse((await readFile(path.join(dir, file), "utf8")).trim().split("\n").pop()!);
    expect(line.event).toEqual(event);
    expect(typeof line.receivedAt).toBe("string");
  });

  it("rechaza JSON inválido sin escribir", async () => {
    const before = (await readFile(path.join(dir, (await readdir(dir))[0]), "utf8")).length;
    expect((await post("{no json")).status).toBe(400);
    const after = (await readFile(path.join(dir, (await readdir(dir))[0]), "utf8")).length;
    expect(after).toBe(before);
  });

  it("rechaza cuerpos de más de 256 KB y sigue vivo", async () => {
    const res = await post(JSON.stringify({ x: "a".repeat(300 * 1024) }));
    expect(res.status).toBe(413);
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("devuelve 405 si no es POST", async () => {
    expect((await fetch(`${base}/hook`)).status).toBe(405);
  });

  it("rechaza peticiones de navegador: con Origin o sin JSON", async () => {
    const forged = JSON.stringify({ session_id: "falsa", hook_event_name: "PermissionRequest" });
    const fromPage = await fetch(`${base}/hook`, { method: "POST", headers: { "content-type": "application/json", origin: "http://localhost:5173" }, body: forged });
    expect(fromPage.status).toBe(403);
    const simple = await fetch(`${base}/hook`, { method: "POST", headers: { "content-type": "text/plain" }, body: forged });
    expect(simple.status).toBe(415);
  });
});
