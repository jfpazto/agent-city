import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import WebSocket from "ws";
import type { ServerMessage, UsageLimits } from "@ciudad/shared";
import { createServer } from "../src/server.ts";
import { parseRollout } from "../src/codex.ts";
import { claudeLimits, codexLimits, createUsageStore } from "../src/usage.ts";

const AT = "2026-10-21T10:00:00.000Z";
const RESET = 1792443755; // segundos epoch
const RESET_ISO = new Date(RESET * 1000).toISOString();

describe("codexLimits", () => {
  it("asigna primary/secondary por window_minutes y recorta el porcentaje", () => {
    const l = codexLimits(
      { primary: { used_percent: 94, window_minutes: 300, resets_at: RESET }, secondary: { used_percent: 130, window_minutes: 10080, resets_at: RESET } },
      AT,
    );
    expect(l).toEqual({
      provider: "codex",
      observedAt: AT,
      fiveHour: { usedPercent: 94, resetsAt: RESET_ISO, windowMinutes: 300 },
      weekly: { usedPercent: 100, resetsAt: RESET_ISO, windowMinutes: 10080 },
    });
  });

  it("ignora ventanas desconocidas, valores no numéricos y bloques vacíos", () => {
    expect(codexLimits({ primary: { used_percent: 10, window_minutes: 60, resets_at: RESET } }, AT)).toBeUndefined();
    expect(codexLimits({ primary: { used_percent: "x", window_minutes: 300, resets_at: RESET } }, AT)).toBeUndefined();
    expect(codexLimits({ primary: { used_percent: null, window_minutes: 300, resets_at: RESET } }, AT)).toBeUndefined();
    expect(codexLimits(null, AT)).toBeUndefined();
  });

  it("parseRollout guarda el último rate_limits, también en eventos sin tokens", () => {
    const ev = (ts: string, payload: object) => JSON.stringify({ timestamp: ts, type: "event_msg", payload });
    const text = [
      JSON.stringify({ timestamp: "2026-10-21T09:00:00Z", type: "session_meta", payload: { id: "r1", cwd: "/tmp/x" } }),
      ev("2026-10-21T09:01:00Z", { type: "token_count", info: { total_token_usage: { input_tokens: 1 } }, rate_limits: { primary: { used_percent: 50, window_minutes: 300, resets_at: RESET } } }),
      ev("2026-10-21T09:02:00Z", { type: "token_count", info: null, rate_limits: { primary: { used_percent: 60, window_minutes: 300, resets_at: RESET } } }),
    ].join("\n");
    const r = parseRollout(text, "r1")!;
    expect(r.limits?.fiveHour?.usedPercent).toBe(60);
    expect(r.limits?.observedAt).toBe("2026-10-21T09:02:00.000Z");
  });
});

describe("claudeLimits", () => {
  it("lee solo rate_limits del JSON de la statusline", () => {
    const l = claudeLimits(
      { model: { id: "m" }, transcript_path: "/privado", rate_limits: { five_hour: { used_percentage: 68, resets_at: RESET }, seven_day: { used_percentage: 12.5, resets_at: RESET } } },
      AT,
    );
    expect(l).toEqual({
      provider: "claude",
      observedAt: AT,
      fiveHour: { usedPercent: 68, resetsAt: RESET_ISO, windowMinutes: 300 },
      weekly: { usedPercent: 12.5, resetsAt: RESET_ISO, windowMinutes: 10080 },
    });
    expect(JSON.stringify(l)).not.toContain("privado");
  });

  it("sin rate_limits (API key o primera respuesta pendiente) no hay dato", () => {
    expect(claudeLimits({ model: { id: "m" } }, AT)).toBeUndefined();
    expect(claudeLimits({ rate_limits: {} }, AT)).toBeUndefined();
  });
});

describe("createUsageStore", () => {
  const l = (observedAt: string, used = 10): UsageLimits => ({ provider: "codex", observedAt, fiveHour: { usedPercent: used, resetsAt: RESET_ISO, windowMinutes: 300 } });

  it("solo acepta datos más nuevos y avisa a los suscriptores", () => {
    const store = createUsageStore();
    const seen: UsageLimits[] = [];
    store.subscribe((x) => seen.push(x));
    expect(store.set(l("2026-10-21T10:00:00Z"))).toBe(true);
    expect(store.set(l("2026-10-21T09:00:00Z", 99))).toBe(false);
    expect(store.set(l("2026-10-21T10:00:00Z", 99))).toBe(false);
    expect(store.set(l("2026-10-21T11:00:00Z"))).toBe(true);
    expect(seen).toHaveLength(2);
    expect(store.list()[0].observedAt).toBe("2026-10-21T11:00:00Z");
  });

  it("persiste en archivo y lo recupera; archivo corrupto equivale a vacío", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-usage-"));
    const file = path.join(dir, "usage.json");
    createUsageStore(file).set(l("2026-10-21T10:00:00Z", 42));
    expect(createUsageStore(file).list()[0].fiveHour?.usedPercent).toBe(42);
    await (await import("node:fs/promises")).writeFile(file, "{roto");
    expect(createUsageStore(file).list()).toEqual([]);
    await rm(dir, { recursive: true, force: true });
  });
});

describe("POST /usage/claude y WebSocket", () => {
  let server: Server;
  let port: number;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-usage-http-"));
    server = createServer({ eventsDir: dir, usageFile: path.join(dir, "usage.json") });
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    await new Promise<void>((r) => server.close(() => r()));
    await rm(dir, { recursive: true, force: true });
  });

  const post = (body: string, headers: Record<string, string> = {}) =>
    fetch(`http://127.0.0.1:${port}/usage/claude`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

  it("guarda el % de contexto de la sesión que manda la statusline", async () => {
    const hook = (b: object) =>
      fetch(`http://127.0.0.1:${port}/hook`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) });
    await hook({ hook_event_name: "SessionStart", session_id: "ctx-1", cwd: "/tmp/ctx" });
    expect((await post(JSON.stringify({ session_id: "ctx-1", context_window: { used_percentage: 73.4, context_window_size: 200000 } }))).status).toBe(204);
    const sessions = (await (await fetch(`http://127.0.0.1:${port}/sessions`)).json()) as { id: string; contextPercent?: number }[];
    expect(sessions.find((s) => s.id === "ctx-1")?.contextPercent).toBe(73);
    await hook({ hook_event_name: "SessionEnd", session_id: "ctx-1" });
  });

  it("rechaza orígenes ajenos y JSON inválido", async () => {
    expect((await post("{}", { origin: "https://ajeno.example" })).status).toBe(403);
    expect((await post("{roto")).status).toBe(400);
  });

  it("guarda solo los límites, los emite por WebSocket y los incluye en el snapshot", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const messages: ServerMessage[] = [];
    ws.on("message", (d) => messages.push(JSON.parse(String(d))));
    await new Promise((r) => ws.on("open", r));
    await new Promise((r) => setTimeout(r, 30));

    const res = await post(JSON.stringify({ cwd: "/privado", rate_limits: { five_hour: { used_percentage: 68, resets_at: RESET } } }));
    expect(res.status).toBe(204);
    await new Promise((r) => setTimeout(r, 50));
    const usage = messages.find((m) => m.type === "usage");
    expect(usage && usage.type === "usage" && usage.limits.fiveHour?.usedPercent).toBe(68);
    ws.close();

    const saved = await readFile(path.join(dir, "usage.json"), "utf8");
    expect(saved).not.toContain("privado");

    const ws2 = new WebSocket(`ws://127.0.0.1:${port}/ws`);
    const first = await new Promise<ServerMessage>((r) => ws2.on("message", (d) => r(JSON.parse(String(d)))));
    expect(first.type === "snapshot" && first.usage?.[0]?.provider).toBe("claude");
    ws2.close();
  });
});
