import fs from "node:fs";
import type { Tokens } from "@ciudad/shared";
import type { ModelTokens } from "./transcript.ts";

/** Precio en $ por millón de tokens. */
/** `cacheWrite` = escritura de caché de 5 min; `cacheWrite1h` = de 1 h (Claude Code la usa). */
export type ModelPrice = { input: number; output: number; cacheRead: number; cacheWrite: number; cacheWrite1h: number };
export type PriceTable = Record<string, ModelPrice>;

/**
 * Fuente: tabla «Current Models» de la skill claude-api de Claude Code (caché del 2026-10-06),
 * tarifas de la API de Anthropic. Escritura de caché de 5 min = 1,25 × entrada, de 1 h = 2 × entrada y lectura = 0,1 × entrada,
 * salvo las lecturas publicadas aparte (Fable 5.1: 0,25; Opus 5.5 y Sonnet 5.5: 0,20).
 * Haiku 5.5: precio hasta 100K tokens de prompt. Se sustituye con CIUDAD_PRICES_FILE (JSON con la misma forma).
 */
export const PRICES_SOURCE = "skill claude-api (Claude Code), tabla Current Models, caché 2026-10-06";

const p = (input: number, output: number, cacheRead = input * 0.1): ModelPrice => ({
  input,
  output,
  cacheRead,
  cacheWrite: input * 1.25,
  cacheWrite1h: input * 2,
});

export const DEFAULT_PRICES: PriceTable = {
  "claude-fable-5-1": p(10, 50, 0.25),
  "claude-fable-5": p(10, 50),
  "claude-opus-5-5": p(4, 20, 0.2),
  "claude-opus-5": p(5, 25),
  "claude-opus-4-8": p(5, 25),
  "claude-opus-4-7": p(5, 25),
  "claude-opus-4-6": p(5, 25),
  "claude-sonnet-5-5": p(2, 10, 0.2),
  "claude-sonnet-5": p(2, 10),
  "claude-sonnet-4-6": p(3, 15),
  "claude-haiku-5-5": p(0.1, 0.5),
  "claude-haiku-4-5": p(1, 5),
};

/** Precio del modelo: coincidencia exacta o el mismo id con sufijo de fecha (`-AAAAMMDD`). Nada más: un modelo nuevo no hereda precio. */
export function priceFor(model: string | undefined, table: PriceTable): ModelPrice | undefined {
  if (!model) return undefined;
  if (table[model]) return table[model];
  const dated = /^(.*)-\d{8}$/.exec(model);
  return dated ? table[dated[1]] : undefined;
}

/** Coste estimado en $ (sin redondear), o undefined si el modelo no está en la tabla. */
export function estimateCost(
  tokens: Tokens & { cacheCreation1h?: number },
  model: string | undefined,
  table: PriceTable,
): number | undefined {
  const price = priceFor(model, table);
  if (!price) return undefined;
  const write1h = Math.min(tokens.cacheCreation1h ?? 0, tokens.cacheCreation);
  return (
    (tokens.input * price.input +
      tokens.output * price.output +
      tokens.cacheRead * price.cacheRead +
      (tokens.cacheCreation - write1h) * price.cacheWrite +
      write1h * price.cacheWrite1h) /
    1_000_000
  );
}

/** Tabla por defecto, o la de CIUDAD_PRICES_FILE si existe y es válida (mezclada encima de la por defecto). */
export function loadPrices(file = process.env.CIUDAD_PRICES_FILE): PriceTable {
  if (!file) return DEFAULT_PRICES;
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, Partial<ModelPrice>>;
    const out: PriceTable = { ...DEFAULT_PRICES };
    for (const [model, v0] of Object.entries(raw)) {
      // cacheWrite1h es opcional en el archivo: por defecto, 2 × entrada.
      const v = { ...v0, cacheWrite1h: v0.cacheWrite1h ?? (typeof v0.input === "number" ? v0.input * 2 : undefined) };
      const nums = [v.input, v.output, v.cacheRead, v.cacheWrite, v.cacheWrite1h];
      if (nums.every((n) => typeof n === "number" && Number.isFinite(n) && n >= 0)) out[model] = v as ModelPrice;
      else console.error(`[collector] precio inválido para ${model} en ${file}; se ignora`);
    }
    return out;
  } catch (err) {
    console.error(`[collector] no se pudo leer ${file}; uso la tabla por defecto`, err);
    return DEFAULT_PRICES;
  }
}

/** Coste de una sesión con varios modelos: cada uno a su precio. Undefined si alguno con tokens no tiene precio. */
export function estimateSessionCost(byModel: Record<string, Tokens & Partial<ModelTokens>>, table: PriceTable): number | undefined {
  let total = 0;
  for (const [model, tokens] of Object.entries(byModel)) {
    const used = tokens.input + tokens.output + tokens.cacheRead + tokens.cacheCreation;
    if (used === 0) continue;
    const c = estimateCost(tokens, model, table);
    if (c === undefined) return undefined;
    total += c;
  }
  return total;
}
