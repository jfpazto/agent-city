# Spec: transcript-tool-counts

## Origen

- Feature: `transcript-tool-counts` (colector). Depende de `transcript-token-parser` (accepted).
- Comportamiento visible: las métricas incluyen el número de comandos (Bash), lecturas (Read/Grep/Glob) y acciones web, y la lista de archivos editados.
- Verificación: tests con un fixture `.jsonl`.

## Objetivo

Que `Session` lleve `tools: { commands, reads, web }` y `editedFiles: string[]`, para el panel de detalle.

## Fuera de alcance

- Mostrarlo en el front.
- Herramientas de subagentes.
- Contar las herramientas MCP de navegador como acciones web: `domain-model.md` define web como WebFetch y WebSearch.

## Formato observado

Las llamadas son bloques `tool_use` (`id`, `name`, `input`) dentro de `message.content` de las líneas `assistant`. Una misma llamada puede repetirse en varias líneas, así que se cuenta una vez por `tool_use.id`. Los archivos salen de `input.file_path`, o de `input.notebook_path` en el caso de `NotebookEdit`.

## Escenarios

1. Se cuentan como comandos las llamadas a Bash, como lecturas las de Read, Grep y Glob, y como web las de WebFetch y WebSearch. El resto (Agent, MCP…) no cuenta.
2. Un `tool_use.id` repetido cuenta una sola vez.
3. Los archivos editados (Edit, MultiEdit, Write y NotebookEdit) se listan sin repetir y en el orden de la primera edición.
4. Los datos llegan a `GET /sessions` y avisan por WS solo si cambian.
5. Con un transcript real, el resultado coincide con el recuento a mano.

## Archivos

`collector/src/transcript.ts`, `sessions.ts`, `server.ts`, `shared` (`ToolCounts`, `tools`, `editedFiles`), `collector/test/fixtures/transcript-tools.jsonl` (inventado), `transcript.test.ts`.

## Documentación duradera

Hay que actualizar `ARCHITECTURE.md` y `docs/pruebas-manuales.md` (§9).

## Privacidad

Las rutas de los archivos solo salen hacia el front local por `127.0.0.1`; el contenido de las ediciones nunca sale.

## Checklist del validador

- [ ] Las categorías siguen `domain-model.md`.
- [ ] Hay deduplicación por `tool_use.id`.
- [ ] Los archivos salen sin repetir y en orden.
- [ ] El fixture es inventado.
- [ ] Coincide con el recuento a mano en un transcript real.
