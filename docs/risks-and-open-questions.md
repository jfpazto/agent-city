# Riesgos y preguntas abiertas

## Bloquean la siguiente fase
Ninguna.

## Se resuelven al implementar
- Eventos de la app de escritorio: confirmado que llegan `PreToolUse` con `session_id`, `cwd`, `transcript_path`, `permission_mode`, `tool_name`, `tool_input` y `prompt_id`, y que los cambios en los hooks se aplican sin reiniciar. Confirmado también `PermissionRequest`, `Notification` (`permission_prompt`), `Stop`, `SessionStart` y `SessionEnd`; detalle en `docs/domain-model.md`. Pendiente: el valor de `notification_type` por inactividad.
- Cómo abrir una sesión concreta desde el panel: respondida (2026-10-19, `open-session-link`). La app registra `claude://`, pero `claude://code/continue?session=` solo acepta ids de escritorio `local_…` o «last», no el `session_id` del transcript, y `claude://resume?session=<uuid>` importa la sesión del CLI en la app (efecto secundario, descartado). La correspondencia transcript → `local_` no se lee por privacidad. «Abrir sesión» copia título, carpeta e id para buscarla a mano. Pendiente: probarlo con la app real. Desde 2026-10-20 el botón ▶ del piso abre la sesión en la app de escritorio: con permiso del autor, el colector lee solo `sessionId` y `cliSessionId` de `~/Library/Application Support/Claude/claude-code-sessions/*/*/local_*.json` para pasar del id del transcript al `local_…` y abre `claude://code/continue?session=local_…`. Si no hay correspondencia (p. ej., sesiones lanzadas desde la terminal) usa Terminal con `claude --resume` (sesiones 040 y 042). Riesgo: es un formato interno no documentado; si cambia, el botón cae a Terminal.
- Formato del título de la sesión: el nombre de la carpeta, el primer mensaje o el título que pone la app.
- Tabla de precios por modelo para el coste estimado.
- Tiempo de inactividad para pasar a `dormida` (por defecto, 30 min).

## Más adelante (fuera del MVP), en este orden
1. ~~Avioneta con lo urgente y notificación del sistema.~~ Hecho (features `urgent-plane` y `urgent-notification`).
2. Historial en SQLite y barra para rebobinar el día.
3. Mensajes entre sesiones (ascensor) y tareas programadas (sótano y aeropuerto).
4. Integraciones: correo (paloma), Slack (torre), reloj o salud (hospital), CPU (tráfico), noticias (vecinos) y contador de tokens histórico (centro de datos).
5. Vista 3D con Three.js.

## Supuestos
- Las sesiones de la app de escritorio respetan los hooks de `~/.claude/settings.json`.
- Los transcripts siguen en `~/.claude/projects/` con un formato estable.

## Riesgos
- `data/events/*.jsonl` guarda solo metadatos de cada hook (evento, sesión, carpeta, herramienta, ids) y el nombre de los campos omitidos; prompts, `tool_input` y salidas solo con `CIUDAD_EVENTS_FULL=1`, para sondear formatos. Se borran los días con más de 7 (`CIUDAD_EVENTS_DAYS`). Ignorado por git.
- El formato del `.jsonl` puede cambiar entre versiones de Claude Code → aislar el parser y cubrirlo con tests.
- Un hook mal escrito podría bloquear las sesiones → timeout corto y salida siempre con código 0.
- Con muchas sesiones, la torre puede no caber → scroll vertical y zoom desde el MVP.

## Tareas de investigación
- Volcar a un archivo un día de eventos reales para fijar la máquina de estados con datos reales.
