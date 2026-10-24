import { describe, expect, it } from "vitest";
import type { Session } from "@ciudad/shared";
import { decideFinished, finishedContent, notifyButton } from "../src/urgent/notify.ts";

const s = (id: string, state: Session["state"]): Session => ({ id, title: `t-${id}`, floor: 0, state, lastEventAt: "2026-10-21T10:00:00Z", project: { id: "p", name: "Proy" } });

describe("señal de humo: sesiones que ya respondieron", () => {
  it("solo avisa del paso trabajando/te_necesita → para_revisar, una vez", () => {
    let r = decideFinished(new Map(), [s("a", "trabajando"), s("b", "te_necesita"), s("c", "para_revisar")]);
    expect(r.finished).toEqual([]);
    r = decideFinished(r.states, [s("a", "para_revisar"), s("b", "para_revisar"), s("c", "para_revisar")]);
    expect(r.finished.map((x) => x.id)).toEqual(["a", "b"]);
    r = decideFinished(r.states, [s("a", "para_revisar"), s("b", "dormida"), s("c", "para_revisar")]);
    expect(r.finished).toEqual([]);
  });

  it("texto del aviso, uno o agrupado", () => {
    expect(finishedContent([s("a", "para_revisar")])).toEqual({ title: "t-a ya respondió", body: "Lista para revisar · Proy" });
    expect(finishedContent([s("a", "para_revisar"), s("b", "para_revisar")]).title).toBe("2 sesiones ya respondieron");
  });

  it("con avisos bloqueados explica cómo activarlos", () => {
    expect(notifyButton("denied").help).toMatch(/Notificaciones/);
  });
});
