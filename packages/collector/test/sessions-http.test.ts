import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import type { Session } from "@ciudad/shared";
import { createServer } from "../src/server.ts";
import type { SessionStore } from "../src/sessions.ts";

let base: string;
let dir: string;
const servers: Server[] = [];

async function start(store?: SessionStore) {
  const server = createServer({ eventsDir: dir, store });
  servers.push(server);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
}

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-sessions-"));
  base = await start();
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise<void>((r) => s.close(() => r()))));
  await rm(dir, { recursive: true, force: true });
});

const hook = (b: string, e: object) =>
  fetch(`${b}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(e) });

describe("GET /sessions", () => {
  it("refleja el estado tras una secuencia real", async () => {
    const id = "http-1";
    for (const name of ["SessionStart", "UserPromptSubmit", "PreToolUse", "PermissionRequest"]) {
      expect((await hook(base, { hook_event_name: name, session_id: id, cwd: "/tmp/x", tool_name: "Bash" })).status).toBe(204);
    }
    await hook(base, { hook_event_name: "SessionStart", session_id: "http-2" });
    const list = (await (await fetch(`${base}/sessions`)).json()) as Session[];
    expect(list.map((s) => [s.id, s.state, s.floor])).toEqual([
      ["http-1", "te_necesita", 0],
      ["http-2", "dormida", 1],
    ]);
    expect((await readdir(dir)).length).toBe(1); // el log sigue escribiéndose
  });

  it("/hook responde 204 aunque falle el store", async () => {
    const broken: SessionStore = { apply: () => { throw new Error("boom"); }, list: () => [], get: () => undefined, tick: () => {}, setMetrics: () => {}, setContext: () => {}, seed: () => false, markReviewed: () => undefined, upsertCodex: () => {}, pruneCodex: () => {}, remove: () => false, subscribe: () => () => {} };
    const b = await start(broken);
    expect((await hook(b, { hook_event_name: "Stop", session_id: "z" })).status).toBe(204);
  });
});
