# Spec: cost-estimate

## Origen

- Feature: `cost-estimate` (colector). Depende de `transcript-token-parser` (accepted).
- Comportamiento visible: cada sesión muestra su coste estimado en $ a precio de API, según una tabla de precios configurable por modelo.
- Verificación: test con precios fijos y tokens conocidos.
- Nota del feature_list: anotar la fuente y la fecha de la tabla.

## Objetivo

Que `GET /sessions` y el WebSocket lleven `costUsd` por sesión. Lo mostrarán el panel y la barra.

## Fuera de alcance

Mostrarlo en el front, coste por día, precios de Bedrock o Vertex, modo rápido y Batch.

## Decisiones

- **Fuente de la tabla:** la tabla «Current Models» de la skill `claude-api` de Claude Code, guardada en caché el 2026-10-06, con las tarifas de la API de Anthropic. Está en `PRICES_SOURCE` dentro de `collector/src/pricing.ts`.
- **Caché:** la escritura de 5 min cuesta 1,25 × la entrada, la de 1 h cuesta 2 × la entrada (Claude Code usa la de 1 h) y la lectura 0,1 × la entrada. Las excepciones son las lecturas que se publican aparte: Fable 5.1 a 0,25 y Opus 5.5 y Sonnet 5.5 a 0,20. Haiku 5.5 se cobra al precio de hasta 100K tokens. La parte de 1 h sale de `usage.cache_creation.ephemeral_1h_input_tokens` y el resto se cobra como 5 min. En `CIUDAD_PRICES_FILE`, `cacheWrite1h` es opcional y por defecto vale 2 × la entrada.
- **Varios modelos en una sesión:** el transcript suma los tokens por modelo (`byModel`) y el coste aplica a cada modelo su precio.
- **Modelos sin precio:** si alguno de los modelos usados no está en la tabla, `costUsd` queda `undefined`. Es mejor no dar número que dar uno falso.
- **Ids con fecha:** solo se acepta el sufijo `-AAAAMMDD` (`claude-opus-5-20261001` → `claude-opus-5`). Un modelo nuevo como `claude-opus-5-7` no hereda el precio de otro: queda `undefined`.
- **Configurable:** `CIUDAD_PRICES_FILE` apunta a un JSON con la misma forma, que se mezcla encima de la tabla por defecto. Las entradas inválidas se ignoran con un aviso.

## Escenarios

1. Con precios fijos y tokens conocidos, el coste es exacto.
2. Con un modelo ausente o desconocido, el resultado es `undefined`.
3. En una sesión con Sonnet y Opus, cada modelo se calcula a su precio, y la escritura de caché de 1 h, al suyo.
4. `CIUDAD_PRICES_FILE` sustituye o añade modelos; si el archivo no existe, se usa la tabla por defecto.
5. Con un transcript real, el resultado coincide con el cálculo a mano.

## Archivos

`collector/src/pricing.ts` (nuevo), `transcript.ts` (`byModel`), `server.ts`, `sessions.ts` (`setMetrics` genérico), `shared` (`costUsd`), `collector/test/pricing.test.ts`, `transcript.test.ts`.

## Documentación duradera

Hay que actualizar `ARCHITECTURE.md` (una línea sobre los precios) y `docs/pruebas-manuales.md` (§9). `CONSTRAINTS.md` y `AGENTS.md` no cambian.

## Checklist del validador

- [ ] La tabla anota su fuente y fecha, y es configurable.
- [ ] Hay test con precios fijos.
- [ ] Cada modelo de una sesión mixta se cobra a su precio.
- [ ] Si falta un precio, el resultado es `undefined` y no un número inventado (tampoco por prefijo).
- [ ] La caché de 1 h se cobra a 2 × la entrada.
- [ ] Coincide con el cálculo a mano en un transcript real.
