import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type http from "node:http";
import { createServer } from "../src/server.ts";
import { createSessionStore, reduce, review, type SessionStore } from "../src/sessions.ts";

const T0 = new Date("2026-10-19T10:00:00Z");

describe("review (puro)", () => {
  it("solo para_revisar pasa a dormida", () => {
    const stop = reduce(undefined, { hook_event_name: "Stop", session_id: "s" }, T0)!;
    expect(review(stop)?.state).toBe("dormida");
    const working = reduce(undefined, { hook_event_name: "UserPromptSubmit", session_id: "s" }, T0)!;
    expect(review(working)).toBeUndefined();
  });
});

describe("POST /sessions/:id/reviewed", () => {
  let server: http.Server;
  let store: SessionStore;
  let base: string;
  let dir: string;
  const msgs: unknown[] = [];

  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-rev-"));
    store = createSessionStore();
    store.apply({ hook_event_name: "Stop", session_id: "amarilla" }, T0);
    store.apply({ hook_event_name: "UserPromptSubmit", session_id: "verde" }, T0);
    msgs.length = 0;
    store.subscribe((m) => msgs.push(m));
    server = createServer({ store, eventsDir: dir, ws: false });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  });
  afterEach(async () => {
    await new Promise((ok) => server.close(ok));
    await fs.rm(dir, { recursive: true, force: true });
  });

  const post = (id: string, origin?: string) =>
    fetch(`${base}/sessions/${encodeURIComponent(id)}/reviewed`, { method: "POST", headers: origin ? { origin } : {} });

  it("para_revisar → dormida, avisa una vez y devuelve CORS para el front local", async () => {
    const r = await post("amarilla", "http://localhost:5173");
    expect(r.status).toBe(200);
    expect(r.headers.get("access-control-allow-origin")).toBe("http://localhost:5173");
    expect(await r.json()).toEqual({ ok: true, changed: true });
    expect(store.get("amarilla")?.state).toBe("dormida");
    expect(msgs).toHaveLength(1);
  });

  it("otros estados no cambian", async () => {
    expect(await (await post("verde")).json()).toEqual({ ok: true, changed: false });
    expect(store.get("verde")?.state).toBe("trabajando");
    expect(msgs).toHaveLength(0);
  });

  it("id desconocido → 404; origen ajeno → 403; GET → 405", async () => {
    expect((await post("nadie")).status).toBe(404);
    expect((await post("amarilla", "https://evil.example")).status).toBe(403);
    expect(store.get("amarilla")?.state).toBe("para_revisar");
    expect((await fetch(`${base}/sessions/amarilla/reviewed`)).status).toBe(405);
  });

  it("id mal codificado → 400 y el colector sigue vivo", async () => {
    const r = await fetch(`${base}/sessions/%E0/reviewed`, { method: "POST" });
    expect(r.status).toBe(400);
    expect(await r.json()).toEqual({ ok: false, error: "bad_id" });
    expect((await fetch(`${base}/health`)).status).toBe(200);
  });

  it("preflight OPTIONS desde un origen ajeno → 403", async () => {
    const r = await fetch(`${base}/sessions/amarilla/reviewed`, { method: "OPTIONS", headers: { origin: "https://evil.example" } });
    expect(r.status).toBe(403);
  });

  it("preflight OPTIONS desde el front local", async () => {
    const r = await fetch(`${base}/sessions/amarilla/reviewed`, { method: "OPTIONS", headers: { origin: "http://127.0.0.1:5173" } });
    expect(r.status).toBe(204);
    expect(r.headers.get("access-control-allow-methods")).toBe("POST");
  });
});
