# Spec: cold-start-rebuild

## Origen

- Feature: `cold-start-rebuild` (colector). Depende de `transcript-token-parser` y `session-state-machine` (accepted).
- Comportamiento visible: al arrancar, el colector detecta los transcripts con actividad en las últimas 24 h y crea sus sesiones en estado dormida con métricas.
- Verificación: reiniciar el colector con sesiones abiertas: aparecen todas.

## Objetivo

Que reiniciar el colector (o el Mac) no deje la torre vacía hasta que cada sesión vuelva a mandar un evento (`domain-model.md`, «Arranque en frío»).

## Fuera de alcance

- Guardar estado en disco (SQLite) o mantener las plantas entre reinicios.
- Retirar sesiones antiguas: lo hace `SessionEnd` o lo hará otra feature.
- Subagentes.

## Decisiones

- Se buscan los transcripts en `<raíz>/<proyecto>/<id>.jsonl`, solo en primer nivel: la carpeta `<id>/subagents/` no cuenta. Valen los modificados en las últimas 24 h (`mtime`). La raíz es la carpeta de transcripts permitida (`~/.claude/projects` o `CIUDAD_TRANSCRIPTS_DIR`).
- Cada transcript da una sesión: el `id` es el nombre del archivo, el estado es `dormida` y `lastEventAt` es el `mtime`. El título es el último `custom-title` del transcript; si no hay, la carpeta del `cwd`; si tampoco, el id corto. Las métricas son las del lector de transcripts, que también recoge `cwd` y título, así que se lee una sola vez.
- Las plantas se asignan del transcript más antiguo al más nuevo (la planta libre más baja). Entre reinicios pueden cambiar si cambia el orden de actividad: es aceptable hasta que haya persistencia.
- Si una sesión ya recibió un evento antes de terminar el arranque, no se toca (`store.seed` devuelve `false`).
- `createServer({ coldStart: true })` solo lo activa `main.ts`; los tests lo llaman explícitamente. No bloquea el arranque y nunca lanza.

## Escenarios

1. Con dos transcripts recientes, uno antiguo, uno de subagente y un `.txt`, se crean las dos sesiones recientes en plantas 0 y 1.
2. Cada sesión sembrada sale dormida, con título, `cwd`, modelo, tokens y coste.
3. Si llega un evento antes de terminar el arranque, la sesión viva no se pisa.
4. Un evento posterior despierta la sesión sembrada sin cambiar su planta.
5. Si la carpeta no existe, no se crean sesiones y no hay error.
6. Real: al arrancar `main.ts`, salen tantas sesiones como `.jsonl` de primer nivel con `mtime` de menos de 24 h.

## Archivos

`collector/src/transcript.ts` (`findRecentTranscripts`, `cwd` y `title` en las métricas), `sessions.ts` (`seed`), `server.ts` (`coldStart`, opción `coldStart`), `main.ts`, `collector/test/coldstart.test.ts`.

## Documentación duradera

Hay que actualizar `ARCHITECTURE.md` y `docs/pruebas-manuales.md`.

## Checklist del validador

- [ ] Solo cuentan los `.jsonl` de primer nivel con menos de 24 h.
- [ ] Las sesiones salen dormidas, con métricas y título.
- [ ] Una sesión viva no se pisa.
- [ ] La prueba real con `main.ts` da el número esperado.
- [ ] El arranque no se bloquea y los errores se capturan.
