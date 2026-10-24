/** Sonido opcional de los avisos: una campanilla corta hecha con Web Audio, sin archivos. */
export type ChimeKind = "urgent" | "finished";

/** Notas de cada aviso: rojo, dos tonos agudos que suben; ya respondió, dos tonos suaves que bajan. */
export function chimeNotes(kind: ChimeKind): { freq: number; at: number; dur: number }[] {
  return kind === "urgent"
    ? [{ freq: 880, at: 0, dur: 0.12 }, { freq: 1175, at: 0.16, dur: 0.16 }]
    : [{ freq: 784, at: 0, dur: 0.14 }, { freq: 587, at: 0.16, dur: 0.2 }];
}

export function soundButtonText(on: boolean): string {
  return on ? "Sonido: sí" : "Sonido: no";
}

let ctx: AudioContext | undefined;

/** Toca la campanilla. Si el navegador no deja (sin gesto previo o sin Web Audio), no hace nada. */
export function playChime(kind: ChimeKind): void {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    for (const n of chimeNotes(kind)) {
      const osc = ctx.createOscillator(), gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = n.freq;
      gain.gain.setValueAtTime(0.0001, t0 + n.at);
      gain.gain.exponentialRampToValueAtTime(0.15, t0 + n.at + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + n.at);
      osc.stop(t0 + n.at + n.dur + 0.02);
    }
  } catch { /* Sin audio: el aviso visual sigue funcionando. */ }
}
