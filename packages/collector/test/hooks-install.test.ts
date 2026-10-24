import { describe, expect, it } from "vitest";
import os from "node:os";
import path from "node:path";
import { addHooks, addStatusLine, EVENTS, MARKER, readSettings, removeHooks, removeStatusLine } from "../scripts/hooks.ts";

// Forma real del settings.json del usuario, con hooks ajenos que deben conservarse.
const fixture = {
  model: "opus",
  permissions: { allow: ["Bash(ls:*)"] },
  hooks: {
    PreToolUse: [{ hooks: [{ type: "command", command: 'python3 "$HOME/.claude/hooks/consultar-cerebro.py"' }] }],
    UserPromptSubmit: [{ hooks: [{ type: "command", command: 'python3 "$HOME/.claude/hooks/aplicar-molde.py"' }] }],
  },
};

const ours = (s: any, e: string) =>
  (s.hooks[e] ?? []).flatMap((g: any) => g.hooks).filter((h: any) => h.command?.includes(MARKER));

describe("addHooks", () => {
  it("añade una entrada nuestra por evento y conserva lo ajeno", () => {
    const out = addHooks(fixture, '"/x/send.sh"');
    for (const e of EVENTS) expect(ours(out, e)).toHaveLength(1);
    expect(out.hooks!.PreToolUse[0]).toEqual(fixture.hooks.PreToolUse[0]);
    expect(out.hooks!.UserPromptSubmit[0]).toEqual(fixture.hooks.UserPromptSubmit[0]);
    expect(out.hooks!.PreToolUse[1].matcher).toBe("*");
    expect(out.model).toBe("opus");
    expect(out.permissions).toEqual(fixture.permissions);
    expect(fixture.hooks.PreToolUse).toHaveLength(1); // no muta la entrada
  });

  it("es idempotente", () => {
    const twice = addHooks(addHooks(fixture, "a"), "a");
    for (const e of EVENTS) expect(ours(twice, e)).toHaveLength(1);
  });
});

describe("removeHooks", () => {
  it("deja el settings igual que antes de instalar", () => {
    expect(removeHooks(addHooks(fixture, "a"))).toEqual(fixture);
  });
});

describe("statusline", () => {
  it("se instala si no hay ninguna y se quita al desinstalar", () => {
    const { settings, installed } = addStatusLine(fixture, '"/x/statusline.sh"');
    expect(installed).toBe(true);
    expect(settings.statusLine?.command).toContain(MARKER);
    expect(removeStatusLine(settings).statusLine).toBeUndefined();
    expect(removeStatusLine(settings).model).toBe("opus");
  });

  it("una statusline ajena no se pisa ni se borra", () => {
    const own = { ...fixture, statusLine: { type: "command", command: "~/mi-statusline.sh" } };
    const { settings, installed } = addStatusLine(own, '"/x/statusline.sh"');
    expect(installed).toBe(false);
    expect(settings.statusLine).toEqual(own.statusLine);
    expect(removeStatusLine(own).statusLine).toEqual(own.statusLine);
  });

  it("reinstalar actualiza la nuestra", () => {
    const once = addStatusLine(fixture, '"/a/statusline.sh"').settings;
    const again = addStatusLine(once, '"/b/statusline.sh"');
    expect(again.installed).toBe(true);
    expect(again.settings.statusLine?.command).toContain("/b/");
  });
});

describe("readSettings", () => {
  it("si no existe settings.json parte de un objeto vacío", async () => {
    const r = await readSettings(path.join(os.tmpdir(), `ciudad-no-existe-${process.pid}`, "settings.json"));
    expect(r).toEqual({ settings: {}, existed: false });
  });
});
