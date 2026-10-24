import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { createServer } from "../src/server.ts";
import { createSessionStore } from "../src/sessions.ts";
import { addHooks, CODEX_EVENTS, MARKER, removeHooks } from "../scripts/hooks.ts";

const run = promisify(execFile);
const ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join(ROOT, "packages/collector/scripts/hooks.ts");
const TSX = path.join(ROOT, "node_modules/.bin/tsx");

let server: Server;
let base: string;
let dir: string;
const store = createSessionStore();

beforeAll(async () => {
  dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-codex-hooks-"));
  server = createServer({ eventsDir: dir, store });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(async () => {
  await new Promise<void>((r) => server.close(() => r()));
  await rm(dir, { recursive: true, force: true });
});

const post = (query: string, body: unknown) =>
  fetch(`${base}/hook${query}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
const lastLine = async () => {
  const [file] = await readdir(dir);
  return JSON.parse((await readFile(path.join(dir, file), "utf8")).trim().split("\n").pop()!);
};

describe("POST /hook?agent=codex", () => {
  it("registra el evento marcado como codex y no toca el store", async () => {
    const res = await post("?agent=codex", { hook_event_name: "SessionStart", session_id: "codex-1", turn_id: "t1", model: "gpt" });
    expect(res.status).toBe(204);
    const line = await lastLine();
    expect(line.agent).toBe("codex");
    expect(line.event).toMatchObject({ hook_event_name: "SessionStart", session_id: "codex-1", turn_id: "t1" });
    expect(store.get("codex-1")).toBeUndefined();
  });

  it("sin agent sigue siendo claude y alimenta el store", async () => {
    expect((await post("", { hook_event_name: "SessionStart", session_id: "claude-1", cwd: "/tmp" })).status).toBe(204);
    expect((await lastLine()).agent).toBe("claude");
    expect(store.get("claude-1")).toBeDefined();
  });

  it("rechaza un agente desconocido sin escribir", async () => {
    const [file] = await readdir(dir);
    const before = (await stat(path.join(dir, file))).size;
    expect((await post("?agent=otro", { hook_event_name: "Stop" })).status).toBe(400);
    expect((await stat(path.join(dir, file))).size).toBe(before);
  });
});

describe("instalador de Codex", () => {
  it("añade un hook por evento de Codex con el agente en el comando", () => {
    const out = addHooks({}, '"/x/send.sh" codex', CODEX_EVENTS);
    expect(Object.keys(out.hooks!)).toEqual([...CODEX_EVENTS]);
    expect(out.hooks!.Stop[0].hooks[0].command).toBe(`"/x/send.sh" codex # ${MARKER}`);
    expect(removeHooks(out).hooks).toEqual({});
  });

  async function cli(file: string, ...args: string[]) {
    await run(TSX, [SCRIPT, ...args], { env: { ...process.env, CODEX_HOOKS_PATH: file } });
  }

  it("instalar dos veces y desinstalar deja el archivo idéntico", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "ciudad-codex-cfg-"));
    const file = path.join(tmp, "hooks.json");
    const original = JSON.stringify({ hooks: { Stop: [{ hooks: [{ type: "command", command: "ajeno.sh" }] }] } }, null, 2) + "\n";
    await writeFile(file, original);
    await cli(file, "install", "codex");
    await cli(file, "install", "codex");
    const installed = JSON.parse(await readFile(file, "utf8"));
    expect(installed.hooks.Stop).toHaveLength(2);
    expect(installed.hooks.Stop[1].hooks[0].command).toContain("send.sh\" codex");
    await cli(file, "uninstall", "codex");
    expect(await readFile(file, "utf8")).toBe(original);
    expect((await readdir(tmp)).filter((n) => n.includes(".bak-"))).toHaveLength(3);
    await rm(tmp, { recursive: true, force: true });
  });

  it("si no existía, desinstalar lo borra", async () => {
    const tmp = await mkdtemp(path.join(os.tmpdir(), "ciudad-codex-cfg-"));
    const file = path.join(tmp, "hooks.json");
    await cli(file, "install", "codex");
    expect(Object.keys(JSON.parse(await readFile(file, "utf8")).hooks)).toHaveLength(CODEX_EVENTS.length);
    await cli(file, "uninstall", "codex");
    expect((await readdir(tmp)).includes("hooks.json")).toBe(false);
    await rm(tmp, { recursive: true, force: true });
  });
});
