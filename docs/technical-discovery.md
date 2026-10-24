# Discovery técnico

## Superficie
App web local (`localhost`) abierta en el navegador o en el panel del navegador de la app. Solo para el Mac del usuario.

## Stack elegido
- **Front**: Vite + TypeScript + PixiJS (2D pixel art). Más adelante, Three.js para la vista 3D.
- **Colector**: Node (TypeScript) con un servidor HTTP para los hooks y WebSocket para el front.
- **Hooks**: un comando ligero (`curl` o un script de Node) con un timeout corto que hace POST del JSON del hook al colector y termina siempre con código 0.

## Datos y almacenamiento
- MVP: estado en memoria y reconstrucción desde los transcripts al arrancar. Opcional: SQLite para el historial (necesario más adelante para rebobinar).
- Fuente de las métricas: `~/.claude/projects/<ruta-codificada>/<session_id>.jsonl` (campos `message.usage`, `tool_use` y `model`).
- Precios por modelo en una tabla local configurable para estimar el coste.
- Proyecto/agente: identidad derivada de los metadatos Git comunes (`.git` y `commondir`), con resolución cacheada por carpeta. Subcarpetas y worktrees se agrupan en un edificio. Sin Git se usa la carpeta; sin carpeta, «Sin proyecto». La resolución no ejecuta Git ni sus hooks y no lee conversaciones adicionales. El orden de los edificios y sus pisos vive en memoria; se reconstruye al reiniciar el colector.
- Front: barrio derivado de `Session.agent` (ausente = Claude); edificio por proyecto/proveedor. El contrato admite Codex, pero su colector aún no está integrado.
- `localStorage` del navegador/origen guarda solares, relaciones manuales y preferencia de movimiento; parser validado, fallback en memoria. No se envían a ningún servicio. La demo usa un espacio separado.
- Límites de uso (verificado el 2026-10-21): Codex escribe `rate_limits` en sus rollouts (`primary` 5 h y `secondary` semanal, con `used_percent`, `window_minutes` y `resets_at` en segundos epoch). Claude Code 2.1.304 no lo guarda en los transcripts; lo pasa a la statusline como `rate_limits.five_hour|seven_day.{used_percentage, resets_at}`, solo con suscripción de Claude.ai y tras la primera respuesta. Comprobado en la documentación incluida en el binario instalado.
- Vida ambiental y puentes son visuales: no hay detección ni envío de mensajes entre proyectos. Mismo id de proyecto entre barrios se relaciona automáticamente; los demás vínculos se declaran manualmente.

## Integraciones
MVP: solo los hooks y los transcripts de Claude Code. Las fases siguientes (Gmail, Slack, Garmin, CPU, cron y RSS) se tratarán en su momento.

## Autenticación
Ninguna. El colector escucha solo en `127.0.0.1`.

## Despliegue y operación
Se arranca a mano con `npm run dev`: colector en `127.0.0.1:4317` (variable `COLLECTOR_PORT`) y front en `localhost:5173`. Más adelante, quizá con un `launchd` para que arranque solo.

## Pruebas y verificación
- Tests unitarios de la máquina de estados (eventos → estado) y del parser de transcripts con fixtures `.jsonl` anonimizados.
- Prueba manual con sesiones reales siguiendo el plan de validación del brief.

## Observabilidad
El colector registra los eventos recibidos y los errores de parseo en la consola; tiene un endpoint `/health`.

## Restricciones
- Los hooks no pueden ralentizar ni romper Claude Code: timeout de 1 s o menos y fallo silencioso.
- Privacidad: los transcripts contienen código y conversaciones; nada sale de la máquina.

## Eventos de Codex por hooks (2026-10-23, Codex CLI 0.163.0)

- Los hooks se leen de `~/.codex/hooks.json`, con el mismo esquema que Claude. Eventos según el binario: `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop`, `Interrupt` y `SessionEnd` (no hay `Notification` ni `PostToolUseFailure`). Campos: `session_id`, `turn_id`, `agent_id`, `agent_type`, `transcript_path`, `hook_event_name`, `model`, `permission_mode`, `trigger`, `tool_name`, `tool_input`, `tool_use_id`, `tool_response`.
- **Confianza de hooks:** Codex no ejecuta un hook nuevo hasta que se aprueba. La aprobación queda en `config.toml` (`hooks.state."<id>".trusted_hash`) y se da en la pantalla de revisión de hooks que muestra la TUI al arrancar (`codex` interactivo). Sin ella, `codex exec` ignora los hooks sin avisar. `--dangerously-bypass-hook-trust` los ejecuta en una sola invocación (no se usó). Si cambia el comando instalado, cambia el hash y hay que volver a aprobarlo.
- Pendiente de confirmar con una sesión real (tras la aprobación): qué eventos llegan, en qué orden y con qué campos.
