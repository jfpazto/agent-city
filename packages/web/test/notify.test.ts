import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { decideNotify, notificationContent, notifyButton } from "../src/urgent/notify.ts";

const s = (id: string, lastMessage?: string): Session => ({ id, title: `t-${id}`, floor: 0, state: "te_necesita", lastEventAt: "2026-10-19T10:00:00Z", lastMessage });

describe("avisos de lo urgente", () => {
  it("uno por episodio: sigue en rojo → ninguno más; sale y vuelve → otro", () => {
    let r = decideNotify(new Set(), [s("a")]);
    expect(r.notify.map((x) => x.id)).toEqual(["a"]);
    r = decideNotify(r.notified, [s("a")]);
    expect(r.notify).toEqual([]);
    r = decideNotify(r.notified, []);
    r = decideNotify(r.notified, [s("a")]);
    expect(r.notify.map((x) => x.id)).toEqual(["a"]);
  });

  it("varios a la vez: un único aviso agrupado", () => {
    const r = decideNotify(new Set(["a"]), [s("a"), s("b"), s("c")]);
    expect(r.notify.map((x) => x.id)).toEqual(["b", "c"]);
    expect(notificationContent(r.notify)).toEqual({ title: "2 sesiones te necesitan", body: "t-b · t-c" });
  });

  it("uno solo: título y último mensaje", () => {
    expect(notificationContent([s("a", "Necesita permiso para Bash")])).toEqual({ title: "t-a te necesita", body: "Necesita permiso para Bash" });
    expect(notificationContent([s("a")]).body).toBe("Lleva más de 1 minuto esperando.");
  });

  it("botón según el permiso", () => {
    expect(notifyButton("default")).toEqual({ text: "Activar avisos", disabled: false, hidden: false });
    expect(notifyButton("granted").disabled).toBe(true);
    expect(notifyButton("denied").text).toBe("Avisos bloqueados");
    expect(notifyButton("unsupported").hidden).toBe(true);
  });
});
