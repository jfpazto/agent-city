import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { codexState, parseRollout } from "../src/codex.ts";
import { DEFAULT_PRICES } from "../src/pricing.ts";
import { createCodexPoller } from "../src/server.ts";
import { createSessionStore } from "../src/sessions.ts";
import { resumeCommand } from "../src/openSession.ts";

const ID = "01a1559c-b0d2-7a91-b6c6-7bef0bff0857";
const SUB = "01a1443c-c844-7a82-a711-760bc5f05de6";
const NOW = new Date("2026-10-19T12:00:00Z");
const MIN = 60_000;
const line = (ts: Date, type: string, payload: object) => JSON.stringify({ timestamp: ts.toISOString(), type, payload }) + "\n";
const ago = (m: number) => new Date(NOW.getTime() - m * MIN);

function rollout(id: string, cwd: string, opts: { complete?: boolean; at?: number; subagent?: boolean } = {}) {
  const at = opts.at ?? 5;
  return (
    line(ago(at + 2), "session_meta", { id, cwd, source: opts.subagent ? { subagent: { thread_spawn: { parent_thread_id: ID } } } : "vscode" }) +
    line(ago(at + 2), "event_msg", { type: "task_started", turn_id: "t1" }) +
    line(ago(at + 2), "event_msg", { type: "thread_settings_applied", thread_settings: { model: "gpt-x" } }) +
    line(ago(at + 1), "response_item", { type: "function_call", name: "exec_command", arguments: "{}" }) +
    line(ago(at + 1), "event_msg", {
      type: "token_count",
      info: {
        total_token_usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20, total_tokens: 120 },
        last_token_usage: { total_tokens: 120 },
      },
    }) +
    (opts.complete === false ? "" : line(ago(at), "event_msg", { type: "task_complete", turn_id: "t1", last_agent_message: "privado" }))
  );
}

describe("parseRollout", () => {
  it("saca carpeta, modelo, tokens, herramientas y estado sin el texto", () => {
    const r = parseRollout(rollout(ID, "/tmp/alfa"), ID)!;
    expect(r).toMatchObject({ id: ID, cwd: "/tmp/alfa", model: "gpt-x", working: false, finished: true, toolCalls: 1, subagent: false });
    expect(r.tokens).toEqual({ input: 40, output: 20, cacheRead: 60, cacheCreation: 0 });
    expect(JSON.stringify(r)).not.toContain("privado");
  });

  it("turno abierto → trabajando; terminado hace poco → para_revisar; viejo → dormida", () => {
    expect(codexState(parseRollout(rollout(ID, "/a", { complete: false }), ID)!, NOW, 30 * MIN)).toBe("trabajando");
    expect(codexState(parseRollout(rollout(ID, "/a"), ID)!, NOW, 30 * MIN)).toBe("para_revisar");
    expect(codexState(parseRollout(rollout(ID, "/a", { at: 60 }), ID)!, NOW, 30 * MIN)).toBe("dormida");
  });

  it("sin session_meta no es una sesión; líneas rotas se ignoran", () => {
    expect(parseRollout("{roto\n", ID)).toBeNull();
    expect(parseRollout("{roto\n" + rollout(ID, "/a"), ID)?.id).toBe(ID);
  });

  it("reanuda con codex resume", () => {
    expect(resumeCommand(ID, "/tmp/a b", "codex")).toBe(`cd '/tmp/a b' && codex resume ${ID}`);
  });
});

describe("sondeo de Codex", () => {
  let dir: string;
  async function write(id: string, text: string) {
    const file = path.join(dir, "sessions/2026/10/19", `rollout-2026-10-19T11-00-00-${id}.jsonl`);
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, text);
    await fs.utimes(file, ago(5), ago(5));
  }
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-codex-"));
  });
  afterEach(() => fs.rm(dir, { recursive: true, force: true }));

  it("cada rollout reciente es un piso codex con título del índice; los subagentes no", async () => {
    await write(ID, rollout(ID, "/tmp/alfa"));
    await write(SUB, rollout(SUB, "/tmp/alfa", { subagent: true }));
    await fs.writeFile(path.join(dir, "session_index.jsonl"), JSON.stringify({ id: ID, thread_name: "Mi hilo" }) + "\n");
    const store = createSessionStore();
    await createCodexPoller(store, dir, DEFAULT_PRICES, 30 * MIN, 7)(NOW);
    const list = store.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: ID, agent: "codex", title: "Mi hilo", state: "para_revisar", projectFloor: 0 });
  });

  it("revisada no vuelve a amarillo sin actividad nueva y comparte proyecto con Claude sin pisarle el piso", async () => {
    await write(ID, rollout(ID, "/tmp/alfa"));
    const store = createSessionStore();
    store.seed({ id: "claude-1", title: "c", cwd: "/tmp/alfa", transcriptPath: "/x", lastEventAt: NOW });
    const poll = createCodexPoller(store, dir, DEFAULT_PRICES, 30 * MIN, 7);
    await poll(NOW);
    expect(store.get(ID)?.projectFloor).toBe(0);
    expect(store.markReviewed(ID)).toBe(true);
    await poll(NOW);
    expect(store.get(ID)?.state).toBe("dormida");
  });

  it("retira la sesión cuando su rollout sale de la ventana", async () => {
    await write(ID, rollout(ID, "/tmp/alfa"));
    const store = createSessionStore();
    const poll = createCodexPoller(store, dir, DEFAULT_PRICES, 30 * MIN, 7);
    await poll(NOW);
    await poll(new Date(NOW.getTime() + 8 * 86_400_000));
    expect(store.get(ID)).toBeUndefined();
  });
});

describe("createRolloutParser (incremental)", () => {
  it("dar el rollout por trozos da lo mismo que leerlo entero", async () => {
    const { createRolloutParser, parseRollout } = await import("../src/codex.ts");
    const lines = [
      { timestamp: "2026-10-22T10:00:00Z", type: "session_meta", payload: { id: "r1", cwd: "/tmp/p" } },
      { timestamp: "2026-10-22T10:00:01Z", type: "event_msg", payload: { type: "task_started" } },
      { timestamp: "2026-10-22T10:00:02Z", type: "response_item", payload: { type: "function_call", name: "shell" } },
      { timestamp: "2026-10-22T10:00:03Z", type: "event_msg", payload: { type: "token_count", info: { total_token_usage: { input_tokens: 50, cached_input_tokens: 20, output_tokens: 7 }, last_token_usage: { total_tokens: 57 } } } },
      { timestamp: "2026-10-22T10:00:04Z", type: "event_msg", payload: { type: "task_complete" } },
    ].map((l) => JSON.stringify(l) + "\n");
    const parser = createRolloutParser("r1");
    parser.feed(lines.slice(0, 2).join(""));
    expect(parser.result()?.working).toBe(true);
    parser.feed(lines.slice(2).join(""));
    expect(parser.result()).toEqual(parseRollout(lines.join(""), "r1"));
    expect(parser.result()).toMatchObject({ working: false, finished: true, toolCalls: 1, tokens: { input: 30, cacheRead: 20, output: 7 } });
  });
});
