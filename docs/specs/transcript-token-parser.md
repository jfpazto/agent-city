# Spec: transcript-token-parser

## Origen

- Feature: `transcript-token-parser` (colector). Depende de `bootstrap-monorepo` (accepted).
- Comportamiento visible: para cada sesión, el colector suma los tokens de entrada, salida y caché, y detecta el modelo a partir de su `.jsonl`.
- Verificación: tests con un fixture `.jsonl` anonimizado; comparar con una suma hecha a mano sobre un transcript real.
- Notas: lectura incremental por offset. Ruta: `~/.claude/projects/<cwd codificado>/<session_id>.jsonl`.

## Objetivo

Que `GET /sessions` y el WebSocket lleven, por sesión, `model` y `tokens` (`input`, `output`, `cacheRead`, `cacheCreation`), al día sin releer el archivo entero. Es la base de `cost-estimate`, `transcript-tool-counts`, `status-bar-counters` y `cold-start-rebuild`.

## Fuera de alcance

- Coste, recuento de herramientas o archivos, consumo por día y reconstrucción al arrancar.
- Transcripts de subagentes (`<session_id>/subagents/*.jsonl`): quedan para una feature posterior.
- Cualquier cambio visible en el front (el tipo compartido gana campos opcionales; el front los ignora).

## Formato observado (transcript real, Claude Code 2026-10)

- Una línea JSON por entrada. Las de uso son `type: "assistant"` con `message.id`, `message.model` y `message.usage` (`input_tokens`, `output_tokens`, `cache_read_input_tokens`, `cache_creation_input_tokens`).
- **El mismo `message.id` se repite en varias líneas (una por bloque de contenido) con el mismo `usage`**: en una sesión real, 36 de 56 ids estaban repetidos. Hay que contar cada id una sola vez.
- Hay modelos sintéticos (`<synthetic>`) en mensajes que no son de la API: no cuentan como modelo.
- Puede haber una última línea a medio escribir.

## Escenarios

1. Fixture con 3 mensajes, uno repetido en 2 líneas: los totales coinciden con la suma de los 3 ids distintos.
2. Líneas no JSON, sin `usage` o de otros tipos se ignoran sin error.
3. El modelo es el del último mensaje con modelo real; `<synthetic>` no lo cambia.
4. Lectura incremental: si el archivo crece, solo se lee lo nuevo; una línea a medias se procesa cuando se completa (sin contarla dos veces, incluso con caracteres multibyte en el corte).
5. Si el archivo encoge (truncado o sustituido), se vuelve a leer desde el principio.
6. Solo se leen rutas `.jsonl` dentro de la carpeta de transcripts (`~/.claude/projects` o `CIUDAD_TRANSCRIPTS_DIR`). Cualquier otra `transcript_path` se ignora.
7. Tras cada evento de una sesión con transcript, y en cada revisión periódica, la sesión publica `model` y `tokens` si cambiaron (aviso `session` por WS). Si no cambian, no hay aviso.
8. Si el archivo no existe todavía, la sesión sigue sin métricas y sin error.

## Investigación del repo

Inspeccionados: `packages/collector/src/sessions.ts` (store, `reduce`, `subscribe`), `server.ts` (`/hook`, intervalo de `tick`), `packages/shared/src/index.ts` (`Session`), tests de `packages/collector/test`, `docs/technical-discovery.md`, `docs/domain-model.md` y un transcript real de esta máquina (solo se miraron las claves y los totales, no el contenido).

## Enfoque técnico

- `packages/collector/src/transcript.ts`:
  - `createTokenAccumulator()` y `feedLines(acc, text)` puros: deduplican por `message.id` y guardan el modelo.
  - `createTranscriptReader({ root })`: guarda un cursor de bytes y un acumulador por ruta; `read(path)` lee de `offset` al final, procesa hasta el último `\n` (en bytes, para no partir caracteres) y devuelve `{ model, tokens }` o `undefined`. Valida que la ruta esté bajo `root` y acabe en `.jsonl`.
- `shared`: `Session` gana `model?: string` y `tokens?: Tokens`.
- `sessions.ts`: `store.setMetrics(id, metrics)` que solo avisa si algo cambió.
- `server.ts`: tras `store.apply`, y en el `tick`, lee el transcript de la sesión (asíncrono, con errores capturados: nunca rompe `/hook`). La opción `transcriptsDir` sirve para los tests.

## Archivos

`packages/collector/src/transcript.ts` (nuevo), `sessions.ts`, `server.ts`, `packages/shared/src/index.ts`, `packages/collector/test/transcript.test.ts` y `test/fixtures/transcript-basic.jsonl` (inventado y anonimizado). Docs: `pruebas-manuales.md`, `feature_list.json`, `PROGRESS.md`.

## Documentación duradera

- `ARCHITECTURE.md`: añadir una línea sobre el lector de transcripts.
- `CONSTRAINTS.md`, `AGENTS.md`: no hace falta.
- `docs/pruebas-manuales.md`: cómo ver `tokens` y `model` en `GET /sessions`.

## Verificación

- `./init.sh` en verde con `transcript.test.ts`.
- Real: arrancar el colector en otro puerto, enviar un evento sintético con la `transcript_path` de una sesión real y comparar `GET /sessions` con una suma hecha a mano en Python (deduplicando por id).

## Checklist del validador

- [ ] Deduplicación por `message.id` con test.
- [ ] Lectura incremental por bytes, con línea partida y truncado cubiertos por tests.
- [ ] Solo rutas `.jsonl` bajo la carpeta de transcripts.
- [ ] `/hook` sigue respondiendo aunque falle la lectura.
- [ ] Coincide con la suma a mano sobre un transcript real.
- [ ] Fixture inventado; nada sale de la máquina.
