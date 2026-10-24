import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { appendEvent, pruneEvents, redactEvent } from "../src/eventLog.ts";

let dir: string;
afterEach(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe("registro de eventos", () => {
  it("no guarda el contenido: prompts y tool_input quedan solo como nombre de campo", () => {
    const event = {
      hook_event_name: "PreToolUse",
      session_id: "s1",
      tool_name: "Bash",
      prompt: "mi secreto",
      tool_input: { command: "export TOKEN=abc" },
    };
    expect(redactEvent(event)).toEqual({
      hook_event_name: "PreToolUse",
      session_id: "s1",
      tool_name: "Bash",
      omitted: ["prompt", "tool_input"],
    });
  });

  it("con full guarda el evento íntegro (para sondear formatos)", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-log-"));
    const event = { hook_event_name: "Stop", session_id: "s1", prompt: "x" };
    const file = await appendEvent(dir, event, new Date("2026-10-22T10:00:00Z"), { full: true, days: 7 });
    expect(JSON.parse((await readFile(file, "utf8")).trim()).event).toEqual(event);
  });

  it("borra los días más antiguos que la retención", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-log-"));
    await writeFile(path.join(dir, "2026-10-01.jsonl"), "{}\n");
    await writeFile(path.join(dir, "2026-10-20.jsonl"), "{}\n");
    await writeFile(path.join(dir, "notas.txt"), "");
    await pruneEvents(dir, 7, new Date("2026-10-22T10:00:00Z"));
    expect((await readdir(dir)).sort()).toEqual(["2026-10-20.jsonl", "notas.txt"]);
  });
});
