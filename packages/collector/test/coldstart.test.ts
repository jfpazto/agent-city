import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { claudeDaysFromEnv, coldStart } from "../src/server.ts";
import { DEFAULT_PRICES } from "../src/pricing.ts";
import { createSessionStore } from "../src/sessions.ts";
import { createTranscriptReader, findRecentTranscripts } from "../src/transcript.ts";

const NOW = new Date("2026-10-19T12:00:00Z");
const HOUR = 3600 * 1000;
const line = (o: object) => JSON.stringify(o) + "\n";
const body = (cwd: string, title?: string) =>
  line({ type: "user", cwd, message: { role: "user", content: "hola" } }) +
  line({ type: "assistant", message: { id: "m1", model: "claude-opus-5-5", usage: { input_tokens: 10, output_tokens: 5 } } }) +
  (title ? line({ type: "custom-title", customTitle: title, sessionId: "x" }) : "");

let root: string;
async function write(rel: string, text: string, ageMs: number) {
  const file = path.join(root, rel);
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, text);
  const t = new Date(NOW.getTime() - ageMs);
  await fs.utimes(file, t, t);
  return file;
}

beforeEach(async () => {
  root = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-cold-"));
  await write("-tmp-alfa/aaa.jsonl", body("/tmp/alfa", "Mi título"), 2 * HOUR);
  await write("-tmp-beta/bbb.jsonl", body("/tmp/beta"), 1 * HOUR);
  await write("-tmp-viejo/ccc.jsonl", body("/tmp/viejo"), 30 * HOUR);
  await write("-tmp-alfa/aaa/subagents/agent-1.jsonl", body("/tmp/alfa"), HOUR);
  await write("-tmp-alfa/notas.txt", "x", HOUR);
});
afterEach(() => fs.rm(root, { recursive: true, force: true }));

describe("findRecentTranscripts", () => {
  it("solo .jsonl de primer nivel de las últimas 24 h, del más antiguo al más nuevo", async () => {
    const r = await findRecentTranscripts(root, NOW);
    expect(r.map((t) => t.id)).toEqual(["aaa", "bbb"]);
  });

  it("carpeta inexistente: lista vacía", async () => {
    expect(await findRecentTranscripts(path.join(root, "no"), NOW)).toEqual([]);
  });
});

describe("coldStart", () => {
  it("crea sesiones dormidas con título, cwd, plantas y métricas", async () => {
    const store = createSessionStore();
    const n = await coldStart(store, createTranscriptReader({ root }), DEFAULT_PRICES, root, NOW);
    expect(n).toBe(2);
    const [a, b] = store.list();
    expect(a).toMatchObject({ id: "aaa", title: "Mi título", cwd: "/tmp/alfa", state: "dormida", floor: 0, model: "claude-opus-5-5" });
    expect(a.lastEventAt).toBe(new Date(NOW.getTime() - 2 * HOUR).toISOString());
    // El subagente de aaa no es una sesión aparte, pero su consumo se suma al de la principal.
    expect(a.tokens).toEqual({ input: 20, output: 10, cacheRead: 0, cacheCreation: 0 });
    expect(a.costUsd).toBeCloseTo((20 * 4 + 10 * 20) / 1e6, 12);
    expect(b).toMatchObject({ id: "bbb", title: "beta", state: "dormida", floor: 1 });
  });

  it("no pisa una sesión que ya recibió eventos", async () => {
    const store = createSessionStore();
    store.apply({ hook_event_name: "UserPromptSubmit", session_id: "bbb", cwd: "/tmp/beta", session_title: "viva" }, NOW);
    await coldStart(store, createTranscriptReader({ root }), DEFAULT_PRICES, root, NOW);
    expect(store.get("bbb")).toMatchObject({ state: "trabajando", title: "viva", floor: 0 });
    expect(store.get("aaa")).toMatchObject({ state: "dormida", floor: 1 });
  });

  it("un evento posterior despierta la sesión sembrada sin cambiar su planta", async () => {
    const store = createSessionStore();
    await coldStart(store, createTranscriptReader({ root }), DEFAULT_PRICES, root, NOW);
    store.apply({ hook_event_name: "PreToolUse", session_id: "bbb", tool_name: "Bash", tool_use_id: "t" }, NOW);
    expect(store.get("bbb")).toMatchObject({ state: "trabajando", floor: 1, model: "claude-opus-5-5" });
  });

  it("con ventana de 2 días entra también el transcript de hace 30 h; la ventana es configurable", async () => {
    const store = createSessionStore();
    expect(await coldStart(store, createTranscriptReader({ root }), DEFAULT_PRICES, root, NOW, 2 * 24 * HOUR)).toBe(3);
    expect(claudeDaysFromEnv(undefined)).toBe(2);
    expect(claudeDaysFromEnv("5")).toBe(5);
    expect(claudeDaysFromEnv("x")).toBe(2);
  });
});
