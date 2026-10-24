# Spec de implementación: los hooks de Codex llegan al colector

## Feature de origen

- `id`: codex-event-probe
- `area`: colector
- `depends_on`: hook-event-probe (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Objetivo

Que cada evento de una sesión de Codex CLI llegue al colector y quede en el log marcado como `codex`, sin que el hook pueda ralentizar ni romper Codex. Sirve para resolver con datos reales qué eventos y campos emite Codex, y así diseñar `codex-sessions` (pisos de Codex en la torre) sobre eventos reales, como se hizo con Claude en `hook-event-probe`.

## Fuera de alcance

- Pintar sesiones de Codex en la torre o meterlas en el store: es `codex-sessions`. En esta feature los eventos de Codex **solo se registran**.
- Leer `~/.codex/sessions` (tokens) y responder a Codex (`codex queue`).
- Devolver decisiones al hook: es solo de observación.

## Historia de trabajo

Cuando trabajo con agentes de Claude y de Codex a la vez,
quiero que los eventos de Codex también lleguen a la Ciudad,
para poder verlos todos en la misma torre más adelante.

## Usuarios y permisos

- El autor, en local. El colector sigue escuchando solo en `127.0.0.1`.

## Lo que ya se sabe (hipótesis a confirmar)

Revisando las cadenas del binario de Codex CLI 0.163.0 (feature `hooks` en `stable` y activa):
- Los hooks se leen de un `hooks.json` con el mismo esquema que Claude (`hooks.<Evento>[] = {matcher?, hooks: [{type:"command", command, timeout}]}`). La ubicación exacta en `~/.codex/` se confirma al implementar (probar `~/.codex/hooks.json`; si no, la sección `[hooks]` de `config.toml`).
- Eventos: `SessionStart`, `SessionEnd`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse`, `PreCompact`, `PostCompact`, `SubagentStart`, `SubagentStop`, `Stop` e `Interrupt`.
- Campos: `session_id`, `turn_id`, `transcript_path`, `cwd`, `hook_event_name`, `model`, `permission_mode`, `tool_name`, `tool_input`, `tool_use_id`, `tool_response`, `last_assistant_message`, `stop_hook_active`.
- `~/.codex/config.toml` ya tiene un `notify` de Computer Use que **no se toca**.

## Escenarios de aceptación

### Escenario 1: evento de Codex marcado
Dado el colector arrancado
cuando llega `POST /hook?agent=codex` con un JSON válido
entonces responde 204 y la línea del log es `{receivedAt, agent:"codex", event}`.

### Escenario 2: Claude no cambia
Dado el colector arrancado
cuando llega `POST /hook` sin `agent`
entonces todo sigue igual que hoy (se registra y alimenta el store). Las líneas antiguas sin `agent` se leen como `claude`.

### Escenario 3: Codex no entra al store
Dado un evento con `agent=codex`
cuando se procesa
entonces se registra, pero **no** crea ni cambia sesiones ni emite por WebSocket.

### Escenario 4: instalador idempotente y reversible
Dado `hooks.json` de Codex con o sin hooks ajenos
cuando se ejecuta `npm run hooks:install:codex` dos veces y luego `npm run hooks:uninstall:codex`
entonces la primera vez añade un hook por evento con la marca `ciudad-de-agentes`, la segunda no duplica y la desinstalación deja el archivo idéntico al original (o lo borra si no existía). Siempre deja copia `.bak-*` y escribe de forma atómica.

### Escenario 5: nunca bloquea
Dado el colector apagado
cuando Codex dispara un hook
entonces `send.sh` termina en menos de 1,5 s, sin salida y con código 0, y Codex sigue sin errores.

### Escenario 6: sesión real
Dada una sesión real de Codex que lee un archivo, pide un permiso y termina
cuando se revisa `data/events/AAAA-MM-DD.jsonl`
entonces aparecen sus eventos con `agent:"codex"` y queda documentado en `docs/technical-discovery.md` qué eventos llegaron, con qué campos y en qué orden.

## Investigación del repositorio

- `packages/collector/hook/send.sh`: curl a `/hook` con timeout de 1 s; acepta `CIUDAD_PORT`. Se le añade el agente por argumento (`send.sh codex` → `/hook?agent=codex`); sin argumento, igual que hoy.
- `packages/collector/scripts/hooks.ts`: `addHooks`/`removeHooks` puros sobre el esquema de Claude, con `MARKER`. Se reutilizan con otra lista de eventos y otra ruta (`CODEX_HOOKS_PATH`, por defecto `~/.codex/hooks.json`), y se tolera que el archivo no exista.
- `packages/collector/src/server.ts:192`: compara `req.url === "/hook"`; hay que comparar solo el path y leer `agent`.
- `packages/collector/src/eventLog.ts`: escribe `{receivedAt, event}`; se añade `agent`.
- `cold-start-rebuild` reconstruye desde el log: debe ignorar las líneas `codex`.

## Enfoque técnico

- `send.sh [agente]`: si hay argumento, añade `?agent=<agente>`. Sigue sin salida y con `exit 0`.
- `server.ts`: parsear la URL; `agent` vale `claude` (por defecto) o `codex`; otro valor → 400. Registrar con `agent`; solo `claude` llama al store.
- `hooks.ts`: parametrizar `EVENTS` y la ruta por destino (`claude` | `codex`). Scripts `hooks:install:codex` y `hooks:uninstall:codex`. El comando instalado es `"<ruta>/send.sh" codex # ciudad-de-agentes`.
- Tests con vitest: query `agent`, 400 con agente desconocido, Codex no toca el store, instalador sobre un `hooks.json` temporal (vacío, inexistente y con hooks ajenos).

## Archivos previstos

- `packages/collector/hook/send.sh`, `packages/collector/scripts/hooks.ts`, `packages/collector/src/server.ts`, `packages/collector/src/eventLog.ts`: modificar.
- Arranque en frío (donde lea el log): ignorar `codex`.
- `package.json`: scripts de Codex.
- Tests en `packages/collector/test/`.
- `docs/technical-discovery.md`: eventos reales de Codex.
- `docs/pruebas-manuales.md`, `ARCHITECTURE.md`, `feature_list.json`, `PROGRESS.md`.

## Impacto visual

Ninguno. La torre no cambia.

## Impacto en la documentación

- `ARCHITECTURE.md`: el flujo de eventos acepta `?agent=codex` y el log guarda el origen.
- `docs/technical-discovery.md`: sección «Eventos de Codex» con los datos reales.
- `docs/pruebas-manuales.md`: cómo instalar los hooks de Codex y ver sus eventos.

## Plan de verificación

- `./init.sh` en verde.
- Instalar sobre una copia temporal de la config de Codex y comprobar el escenario 4 con `diff`.
- Instalar de verdad, abrir `codex` en una carpeta de prueba, pedirle leer un archivo y algo que pida permiso, y revisar el log (escenario 6).
- Con el colector parado, repetir una orden en Codex y medir `send.sh` (escenario 5).
- Comprobar que `GET /sessions` no muestra la sesión de Codex.

## Evidencia a guardar

- Salida de `./init.sh`, el `diff` del instalador, eventos reales resumidos (sin prompts ni salidas, por privacidad) y el tiempo de `send.sh` con el colector apagado.

## Checklist del validador

- [ ] Claude funciona igual que antes.
- [ ] Los eventos de Codex se registran con `agent:"codex"` y no tocan el store ni el WebSocket.
- [ ] El instalador conserva los hooks ajenos y el `notify` de `config.toml`, no duplica y se deshace por completo.
- [ ] El hook nunca bloquea Codex.
- [ ] Los eventos reales están documentados y no incluyen datos privados.
