import { mkdtemp, readFile, readdir, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { desktopSessionsDir, openUrlArgs, terminalLaunchers, winQuote, winResumeCommand } from "../src/openSession.ts";
import { linuxTrashDir, moveSessionToTrash, trashInfo } from "../src/trash.ts";
import { hookCommand } from "../scripts/hooks.ts";
// @ts-expect-error: script .mjs sin tipos
import { systemdUnit, windowsLauncher } from "../../../scripts/autostart.mjs";

const ID = "0f8e5a2c-1234-4abc-9def-0123456789ab";

describe("abrir sesiones en cada sistema", () => {
  it("enlaces: open en macOS, xdg-open en Linux y el manejador de Windows", () => {
    expect(openUrlArgs("claude://x", "darwin")).toEqual(["open", ["claude://x"]]);
    expect(openUrlArgs("claude://x", "linux")).toEqual(["xdg-open", ["claude://x"]]);
    expect(openUrlArgs("claude://code/new?folder=%2Fa", "win32")).toEqual(["rundll32", ["url.dll,FileProtocolHandler", "claude://code/new?folder=%2Fa"]]);
  });

  it("terminal: AppleScript, cmd o la lista de emuladores de Linux", () => {
    const cmd = { unix: "cd '/a' && claude", win: 'cd /d "C:\\a" && claude' };
    expect(terminalLaunchers(cmd, "darwin")[0][0]).toBe("osascript");
    expect(terminalLaunchers(cmd, "win32")).toEqual([["cmd", ["/c", "start", "", "cmd", "/k", cmd.win]]]);
    const linux = terminalLaunchers(cmd, "linux");
    expect(linux.map(([c]) => c)).toEqual(["x-terminal-emulator", "gnome-terminal", "konsole", "xterm"]);
    expect(linux[0][1].at(-1)).toBe(`cd '/a' && claude; exec "\${SHELL:-sh}"`);
  });

  it("orden de Windows: carpeta entre comillas y sin caracteres que cmd interprete", () => {
    expect(winResumeCommand(ID, "C:\\Users\\ana\\proyecto")).toBe(`cd /d "C:\\Users\\ana\\proyecto" && claude --resume ${ID}`);
    expect(winResumeCommand(ID, "C:\\p", "codex")).toBe(`cd /d "C:\\p" && codex resume ${ID}`);
    for (const bad of ['C:\\a" & calc', "C:\\%PATH%", "C:\\a|b", "C:\\a^b"]) expect(() => winQuote(bad)).toThrow();
    expect(() => winResumeCommand("x & calc", "C:\\p")).toThrow();
  });

  it("carpeta de la app de escritorio por sistema", () => {
    expect(desktopSessionsDir("darwin", {}, "/h")).toBe("/h/Library/Application Support/Claude/claude-code-sessions");
    expect(desktopSessionsDir("win32", { APPDATA: "/ad" }, "/h")).toBe(path.join("/ad", "Claude", "claude-code-sessions"));
    expect(desktopSessionsDir("linux", {}, "/h")).toBe(path.join("/h", ".config", "Claude", "claude-code-sessions"));
  });
});

describe("papelera de Linux (freedesktop)", () => {
  const saved = process.env.XDG_DATA_HOME;
  afterEach(() => { process.env.XDG_DATA_HOME = saved; });

  it("mueve a Trash/files y escribe el .trashinfo para poder restaurar", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "ciudad-trash-linux-"));
    try {
      const transcripts = path.join(dir, "projects");
      await mkdir(path.join(transcripts, "p", "s1", "subagents"), { recursive: true });
      const file = path.join(transcripts, "p", "s1.jsonl");
      await writeFile(file, "{}\n");
      process.env.XDG_DATA_HOME = path.join(dir, "share");
      const moved = await moveSessionToTrash(file, [transcripts], undefined, "linux");
      const trash = linuxTrashDir();
      expect(trash).toBe(path.join(dir, "share", "Trash"));
      expect(moved.map((m) => path.basename(m)).sort()).toEqual(["s1", "s1.jsonl"]);
      expect((await readdir(path.join(trash, "info"))).sort()).toEqual(["s1.jsonl.trashinfo", "s1.trashinfo"]);
      const info = await readFile(path.join(trash, "info", "s1.jsonl.trashinfo"), "utf8");
      expect(info).toMatch(/^\[Trash Info\]\nPath=.*\/p\/s1\.jsonl\nDeletionDate=\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\n$/);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("codifica la ruta original", () => {
    expect(trashInfo("/home/ana/mi proyecto/a#b.jsonl", new Date(2026, 9, 24, 9, 5, 7))).toBe(
      "[Trash Info]\nPath=/home/ana/mi%20proyecto/a%23b.jsonl\nDeletionDate=2026-10-24T09:05:07\n",
    );
  });
});

describe("instalación en cada sistema", () => {
  it("hooks: script de sh en macOS y Linux, Node en Windows", () => {
    expect(hookCommand("/r/hook", "send", "linux")).toBe('"/r/hook/send.sh"');
    expect(hookCommand("/r/hook", "statusline", "darwin")).toBe('"/r/hook/statusline.sh"');
    expect(hookCommand("C:/r/hook", "send", "win32")).toBe(`node "${path.join("C:/r/hook", "send.mjs")}"`);
  });

  it("arranque automático: unidad de systemd y lanzador de Windows", () => {
    const unit = systemdUnit("/usr/bin/node");
    expect(unit).toContain("ExecStart=/usr/bin/node ");
    expect(unit).toContain("packages/collector/src/main.ts");
    expect(unit).toContain("Restart=always");
    expect(unit).toContain("WantedBy=default.target");
    const vbs = windowsLauncher("C:\\node\\node.exe");
    expect(vbs).toContain('""C:\\node\\node.exe""');
    expect(vbs).toContain(", 0, False");
  });
});
