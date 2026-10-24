import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createTokenAccumulator, createTranscriptReader, feedLines, isAllowedTranscript } from "../src/transcript.ts";
import { createServer } from "../src/server.ts";

const FIXTURE = path.join(import.meta.dirname, "fixtures", "transcript-basic.jsonl");
const EXPECTED = { input: 15, output: 52, cacheRead: 1200, cacheCreation: 1150 };
const line = (id: string, out: number, extra = "") =>
  JSON.stringify({ type: "assistant", message: { id, model: "claude-haiku-5-5", usage: { output_tokens: out }, extra } }) + "\n";

describe("feedLines (puro)", () => {
  it("suma cada message.id una vez e ignora lo que no es uso", async () => {
    const acc = createTokenAccumulator();
    feedLines(acc, await fs.readFile(FIXTURE, "utf8"));
    expect(acc.tokens).toEqual(EXPECTED);
  });

  it("tokens por modelo", async () => {
    const acc = createTokenAccumulator();
    feedLines(acc, await fs.readFile(FIXTURE, "utf8"));
    expect(acc.byModel["claude-sonnet-5-5"]).toEqual({ input: 13, output: 45, cacheRead: 1200, cacheCreation: 1050, cacheCreation1h: 0 });
    expect(acc.byModel["claude-opus-5-5"]).toEqual({ input: 2, output: 7, cacheRead: 0, cacheCreation: 100, cacheCreation1h: 60 });
  });

  it("modelo: el último real; <synthetic> no cuenta", async () => {
    const acc = createTokenAccumulator();
    feedLines(acc, await fs.readFile(FIXTURE, "utf8"));
    expect(acc.model).toBe("claude-opus-5-5");
  });
});

describe("isAllowedTranscript", () => {
  it("solo .jsonl dentro de la carpeta", () => {
    expect(isAllowedTranscript("/r/p/a.jsonl", "/r")).toBe(true);
    expect(isAllowedTranscript("/r/../etc/passwd.jsonl", "/r")).toBe(false);
    expect(isAllowedTranscript("/otra/a.jsonl", "/r")).toBe(false);
    expect(isAllowedTranscript("/r/p/a.txt", "/r")).toBe(false);
    expect(isAllowedTranscript("/r", "/r")).toBe(false);
  });
});

describe("createTranscriptReader (incremental)", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-tr-"));
    file = path.join(dir, "proj", "s1.jsonl");
    await fs.mkdir(path.dirname(file));
  });
  afterEach(() => fs.rm(dir, { recursive: true, force: true }));

  it("archivo inexistente o fuera de la carpeta: undefined", async () => {
    const r = createTranscriptReader({ root: dir });
    expect(await r.read(file)).toBeUndefined();
    expect(await r.read(FIXTURE)).toBeUndefined();
  });

  it("lee solo lo nuevo y espera a que la línea esté completa (también con multibyte)", async () => {
    const r = createTranscriptReader({ root: dir });
    await fs.writeFile(file, line("m1", 5));
    expect((await r.read(file))!.tokens.output).toBe(5);

    const partial = line("m2", 7, "ñandú ☃");
    const bytes = Buffer.from(partial);
    const cut = bytes.indexOf(Buffer.from("☃")) + 1; // en medio del carácter
    await fs.appendFile(file, bytes.subarray(0, cut));
    expect((await r.read(file))!.tokens.output).toBe(5);
    await fs.appendFile(file, bytes.subarray(cut));
    expect((await r.read(file))!.tokens.output).toBe(12);
    expect((await r.read(file))!.tokens.output).toBe(12);
  });

  it("si el archivo encoge, vuelve a empezar", async () => {
    const r = createTranscriptReader({ root: dir });
    await fs.writeFile(file, line("m1", 5) + line("m2", 7));
    expect((await r.read(file))!.tokens.output).toBe(12);
    await fs.writeFile(file, line("m3", 1));
    expect((await r.read(file))!.tokens.output).toBe(1);
  });

  it("lecturas a la vez no cuentan dos veces", async () => {
    const r = createTranscriptReader({ root: dir });
    await fs.writeFile(file, line("m1", 5) + line("m2", 7));
    const all = await Promise.all([r.read(file), r.read(file), r.read(file)]);
    expect(all.map((m) => m!.tokens.output)).toEqual([12, 12, 12]);
    await fs.appendFile(file, line("m3", 1));
    expect((await r.read(file))!.tokens.output).toBe(13);
  });
});

describe("integración con /hook", () => {
  it("un evento publica model y tokens de la sesión", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-tr-"));
    const file = path.join(dir, "s1.jsonl");
    await fs.copyFile(FIXTURE, file);
    const server = createServer({ eventsDir: path.join(dir, "events"), transcriptsDir: dir, ws: false });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const { port } = server.address() as { port: number };
    try {
      const res = await fetch(`http://127.0.0.1:${port}/hook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hook_event_name: "UserPromptSubmit", session_id: "s1", cwd: "/tmp/p", transcript_path: file }),
      });
      expect(res.status).toBe(204);
      let s: { model?: string; tokens?: unknown } | undefined;
      for (let i = 0; i < 50 && !s?.tokens; i++) {
        await new Promise((r) => setTimeout(r, 10));
        s = ((await (await fetch(`http://127.0.0.1:${port}/sessions`)).json()) as typeof s[])[0];
      }
      expect(s).toMatchObject({ model: "claude-opus-5-5", tokens: EXPECTED });
      // Sonnet 5.5 (msg_a + msg_b: 13 in, 45 out, 1200 lectura, 1050 escritura 5 min)
      // + Opus 5.5 (msg_c: 2 in, 7 out, 40 escritura 5 min a 5 $, 60 escritura 1 h a 8 $)
      const sonnet = 13 * 2 + 45 * 10 + 1200 * 0.2 + 1050 * 2.5;
      const opus = 2 * 4 + 7 * 20 + 40 * 5 + 60 * 8;
      expect((s as { costUsd?: number }).costUsd).toBeCloseTo((sonnet + opus) / 1e6, 12);
    } finally {
      await new Promise((ok) => server.close(ok));
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("store.setMetrics", () => {
  it("avisa solo si cambian modelo o tokens", async () => {
    const { createSessionStore } = await import("../src/sessions.ts");
    const store = createSessionStore();
    store.apply({ hook_event_name: "SessionStart", session_id: "s1" }, new Date());
    const msgs: unknown[] = [];
    store.subscribe((m) => msgs.push(m));
    const m = { model: "claude-opus-5-5", tokens: { input: 1, output: 2, cacheRead: 3, cacheCreation: 4 } };
    store.setMetrics("s1", m);
    store.setMetrics("s1", { ...m, tokens: { ...m.tokens } });
    expect(msgs).toHaveLength(1);
    store.setMetrics("s1", { ...m, tokens: { ...m.tokens, output: 9 } });
    expect(msgs).toHaveLength(2);
    store.setMetrics("nadie", m);
    expect(msgs).toHaveLength(2);
    expect(store.get("s1")).toMatchObject({ model: "claude-opus-5-5", tokens: { output: 9 } });
  });
});

describe("recuento de herramientas", () => {
  const TOOLS = path.join(import.meta.dirname, "fixtures", "transcript-tools.jsonl");

  it("cuenta comandos, lecturas y web, cada tool_use id una vez", async () => {
    const acc = createTokenAccumulator();
    feedLines(acc, await fs.readFile(TOOLS, "utf8"));
    expect(acc.tools).toEqual({ commands: 2, reads: 3, web: 2 });
  });

  it("archivos editados sin repetir y en orden", async () => {
    const acc = createTokenAccumulator();
    feedLines(acc, await fs.readFile(TOOLS, "utf8"));
    expect([...acc.edited]).toEqual(["/p/a.ts", "/p/b.ts", "/p/n.ipynb", "/p/c.ts"]);
  });

  it("llega a GET /sessions", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-tr-"));
    const file = path.join(dir, "s2.jsonl");
    await fs.copyFile(TOOLS, file);
    const server = createServer({ eventsDir: path.join(dir, "events"), transcriptsDir: dir, ws: false });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    const { port } = server.address() as { port: number };
    try {
      await fetch(`http://127.0.0.1:${port}/hook`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ hook_event_name: "Stop", session_id: "s2", transcript_path: file }),
      });
      let s: { tools?: unknown; editedFiles?: unknown } | undefined;
      for (let i = 0; i < 50 && !s?.tools; i++) {
        await new Promise((r) => setTimeout(r, 10));
        s = ((await (await fetch(`http://127.0.0.1:${port}/sessions`)).json()) as typeof s[])[0];
      }
      expect(s).toMatchObject({ tools: { commands: 2, reads: 3, web: 2 }, editedFiles: ["/p/a.ts", "/p/b.ts", "/p/n.ipynb", "/p/c.ts"] });
    } finally {
      await new Promise((ok) => server.close(ok));
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("subagentes", () => {
  const line = (id: string, model: string, input: number, output: number) =>
    JSON.stringify({ type: "assistant", timestamp: "2026-10-22T10:00:00Z", message: { id, model, usage: { input_tokens: input, output_tokens: output } } }) + "\n";

  it("suma tokens y modelos de <id>/subagents/*.jsonl a la sesión principal", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "ciudad-sub-"));
    try {
      const main = path.join(dir, "proj", "s1.jsonl");
      await fs.mkdir(path.join(dir, "proj", "s1", "subagents"), { recursive: true });
      await fs.writeFile(main, line("m1", "claude-opus", 10, 5));
      await fs.writeFile(path.join(dir, "proj", "s1", "subagents", "agent-a.jsonl"), line("a1", "claude-haiku", 100, 50));
      const r = createTranscriptReader({ root: dir });
      const m = (await r.readSession(main))!;
      expect(m.tokens.input).toBe(110);
      expect(m.tokens.output).toBe(55);
      expect(m.model).toBe("claude-opus");
      expect(m.subagents).toBe(1);
      expect(Object.keys(m.byModel).sort()).toEqual(["claude-haiku", "claude-opus"]);
      // La lectura simple sigue siendo solo la principal.
      expect((await r.read(main))!.tokens.input).toBe(10);
    } finally {
      await fs.rm(dir, { recursive: true, force: true });
    }
  });
});

describe("avería (errores de la API)", () => {
  const err = (error: string, sidechain = false) =>
    JSON.stringify({ type: "assistant", timestamp: "2026-10-24T09:00:00Z", isApiErrorMessage: true, error, isSidechain: sidechain, message: { id: "e" + error, model: "<synthetic>", content: [{ type: "text", text: "You've hit your session limit" }] } }) + "\n";
  const ok = JSON.stringify({ type: "assistant", timestamp: "2026-10-24T09:05:00Z", isSidechain: false, message: { id: "ok", model: "claude-opus", usage: { output_tokens: 1 } } }) + "\n";

  it("marca el último error de la conversación principal y lo quita la siguiente respuesta buena", () => {
    const acc = createTokenAccumulator();
    feedLines(acc, err("rate_limit"));
    expect(acc.failure).toEqual({ kind: "rate_limit", at: "2026-10-24T09:00:00Z" });
    feedLines(acc, err("authentication_failed"));
    expect(acc.failure?.kind).toBe("auth");
    feedLines(acc, ok);
    expect(acc.failure).toBeUndefined();
    expect(acc.model).toBe("claude-opus");
  });

  it("un error de un subagente no avería el piso; otro error desconocido es «api»", () => {
    const acc = createTokenAccumulator();
    feedLines(acc, err("rate_limit", true));
    expect(acc.failure).toBeUndefined();
    feedLines(acc, err("overloaded"));
    expect(acc.failure?.kind).toBe("api");
  });
});
