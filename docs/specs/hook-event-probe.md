# Spec de implementación: el colector recibe y registra los eventos de los hooks

## Feature de origen

- `id`: hook-event-probe
- `area`: colector
- `depends_on`: bootstrap-monorepo (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Objetivo

Que cada evento de Claude Code (de cualquier sesión de la app de escritorio) llegue al colector y quede guardado en disco, sin que los hooks puedan ralentizar ni romper ninguna sesión. Además, resolver con datos reales la pregunta abierta de qué eventos emite la app de escritorio y con qué campos, para diseñar luego la máquina de estados (`session-state-machine`) sobre eventos reales.

## Fuera de alcance

- Interpretar los eventos (estados, colores, contadores): es `session-state-machine`.
- WebSocket, front y lectura de transcripts.
- Responder a las sesiones o bloquear herramientas: el hook es solo de observación y nunca devuelve decisiones.
- Rotar o limpiar el log (basta con un archivo por día).

## Historia de trabajo

Cuando tengo varias sesiones abiertas en la app,
quiero que todos sus eventos queden registrados en un solo sitio,
para construir sobre datos reales la vista de estados.

## Usuarios y permisos

- El autor, en local. El endpoint `/hook` solo acepta conexiones a `127.0.0.1` (ya garantizado por el bind del colector).

## Escenarios de aceptación

### Escenario 1: evento recibido
Dado el colector arrancado
cuando se hace `POST /hook` con el JSON de un hook (incluido `hook_event_name` y `session_id`)
entonces responde 204 y se añade una línea JSON a `data/events/AAAA-MM-DD.jsonl` con `{receivedAt, event: <payload íntegro>}`.

### Escenario 2: payload no válido
Dado el colector arrancado
cuando se hace `POST /hook` con un cuerpo que no es JSON, o con más de 256 KB
entonces responde 400 o 413, no escribe nada y el proceso sigue vivo.

### Escenario 3: instalación conservadora de los hooks
Dado `~/.claude/settings.json` con los hooks existentes del usuario (`PreToolUse` → `consultar-cerebro.py`, `UserPromptSubmit` → `aplicar-molde.py`)
cuando ejecuto `npm run hooks:install`
entonces se crea una copia `settings.json.bak-<timestamp>`, se **añade** una entrada nuestra (marcada con `ciudad-de-agentes`) a los eventos `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification`, `Stop`, `SubagentStop` y `SessionEnd`, los hooks existentes siguen intactos y el resto de claves del archivo no cambia.

### Escenario 4: instalación idempotente y desinstalación
Dado que los hooks ya están instalados
cuando ejecuto `npm run hooks:install` otra vez
entonces no se duplican las entradas.
Y cuando ejecuto `npm run hooks:uninstall`
entonces desaparecen solo nuestras entradas.

### Escenario 5: colector apagado
Dado el colector parado y los hooks instalados
cuando uso una sesión de Claude Code (prompt, herramienta y fin de turno)
entonces la sesión funciona con normalidad, sin errores visibles ni esperas de más de 1 s por hook.

### Escenario 6: eventos reales de la app de escritorio
Dado el colector arrancado y los hooks instalados
cuando en una sesión de la app de escritorio envío un prompt, la sesión ejecuta una herramienta, pide un permiso y termina
entonces en el log aparecen `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `Notification` y `Stop` con el mismo `session_id`.

## Investigación del repositorio

### Archivos revisados
- `packages/collector/src/server.ts`: `createServer()` con un enrutado simple por `req.method` y `req.url`. Aquí se añade `/hook`.
- `packages/collector/test/health.test.ts`: patrón de test (puerto 0 y `fetch`).
- `ARCHITECTURE.md`: el colector solo escucha en 127.0.0.1; los tests no abren puertos fijos.
- `docs/domain-model.md`: eventos esperados y el caso del `Notification` por inactividad.
- `~/.claude/settings.json` (solo lectura): claves `env`, `permissions`, `model`, `hooks`, `mcpServers`…; ya hay hooks del usuario en `PreToolUse` y `UserPromptSubmit`.

### Patrones a seguir
- Sin frameworks: `node:http`, `node:fs/promises`.
- Funciones puras testeables y separadas del arranque.

### Lo que falta
- No existe `data/` ni el script de instalación.
- No se ha comprobado qué eventos emite la app de escritorio ni el campo `notification_type` (es lo que resuelve esta feature).

## Enfoque técnico

- **Endpoint** (`collector/src/server.ts`): `POST /hook` lee el cuerpo con un límite de 256 KB, hace `JSON.parse` y llama a `appendEvent(dir, payload)` (`collector/src/eventLog.ts`). Esta función añade la línea `{receivedAt: ISO, event}` al archivo del día. `createServer({ eventsDir })` recibe el directorio para que los tests usen un tmpdir; por defecto, `data/events` en la raíz del repo (configurable con `CIUDAD_DATA_DIR`).
- **Comando del hook**: script `packages/collector/hook/send.sh`:
  ```sh
  curl -s -m 1 -X POST -H 'content-type: application/json' --data-binary @- http://127.0.0.1:${CIUDAD_PORT:-4317}/hook >/dev/null 2>&1; exit 0
  ```
  Lee el JSON por stdin, tiene un timeout de 1 s y termina siempre con código 0 y sin salida (la salida de algunos hooks se inyecta en el contexto de Claude). En `settings.json` se registra con su ruta absoluta y `"timeout": 2`.
- **Instalador** (`packages/collector/scripts/hooks.ts`, ejecutado con `tsx`), con los subcomandos `install` y `uninstall`:
  - Lee `~/.claude/settings.json` (ruta configurable con `CLAUDE_SETTINGS_PATH` para los tests) y escribe la copia `.bak-<timestamp>`.
  - Para cada evento de la lista: si no existe ningún hook cuyo `command` contenga `ciudad-de-agentes`, añade `{ hooks: [{ type: "command", command: "<ruta>/send.sh # ciudad-de-agentes", timeout: 2 }] }`; en `PreToolUse` y `PostToolUse` se añade además `matcher: "*"`.
  - `uninstall` quita solo las entradas marcadas y borra los grupos que queden vacíos.
  - Escribe con 2 espacios de indentación y de forma atómica (archivo temporal + `rename`).
  - Las funciones puras `addHooks(settings, cmd)` y `removeHooks(settings)` se exportan para testearlas.
- **Scripts** en la raíz: `hooks:install` y `hooks:uninstall`.
- `data/` va a `.gitignore`, porque los eventos contienen rutas y prompts.

## Archivos previstos

- `packages/collector/src/server.ts`: modificar; ruta `/hook` y opciones de `createServer`.
- `packages/collector/src/eventLog.ts`: crear.
- `packages/collector/hook/send.sh`: crear (ejecutable).
- `packages/collector/scripts/hooks.ts`: crear.
- `packages/collector/test/hook.test.ts`: crear; escenarios 1 y 2.
- `packages/collector/test/hooks-install.test.ts`: crear; escenarios 3 y 4 con un fixture que reproduce la forma real del `settings.json` (con hooks ajenos).
- `packages/collector/src/main.ts`: modificar solo si hace falta pasar `eventsDir`.
- `package.json`: scripts `hooks:install` y `hooks:uninstall`.
- `.gitignore`: añadir `data/`.
- `docs/risks-and-open-questions.md`, `docs/domain-model.md`: actualizar con los eventos reales observados.
- `feature_list.json`, `PROGRESS.md`: evidencia.

## Impacto visual

- Hay interfaz: no.

## Impacto en la documentación

- `ARCHITECTURE.md`: actualizar con una línea sobre el flujo hook → `send.sh` → `POST /hook` → `data/events/*.jsonl`.
- `CONSTRAINTS.md`: no hace falta (las reglas de los hooks ya están en `AGENTS.md`).
- `AGENTS.md`: añadir una línea con `npm run hooks:install` y `npm run hooks:uninstall`.
- `docs/domain-model.md`: anotar los eventos y campos reales (por ejemplo, el valor de `notification_type` en una petición de permiso y en la inactividad).
- `docs/risks-and-open-questions.md`: dar por resuelta la pregunta sobre los eventos de la app de escritorio.

## Plan de implementación

1. `eventLog.ts` y la ruta `/hook`, con sus tests.
2. `send.sh` y prueba manual con `echo '{...}' | send.sh` con el colector encendido y apagado.
3. Instalador con sus funciones puras y tests con un fixture.
4. Instalar en el `settings.json` real (con copia) y ejecutar el escenario 6 con una sesión real.
5. Anotar los eventos observados en los docs y registrar la evidencia.

## Tareas

- [ ] `appendEvent` con `mkdir -p` y un archivo por día.
- [ ] `/hook`: 204 si va bien, 400 si el JSON no es válido, 413 si supera 256 KB y 405 para cualquier método que no sea POST.
- [ ] `send.sh` con timeout de 1 s, salida 0 y sin stdout.
- [ ] `addHooks`/`removeHooks`, idempotentes y sin tocar los hooks ajenos.
- [ ] CLI `install`/`uninstall` con copia de seguridad y escritura atómica.
- [ ] Tests para los escenarios 1 a 4.
- [ ] `.gitignore` con `data/`.
- [ ] Instalación real y escenario 6, revisando en el log que no se exponen secretos.
- [ ] Docs y evidencia.

## Plan de verificación

- `./init.sh`: typecheck y todos los tests en verde.
- `npm run dev` en segundo plano; `echo '{"hook_event_name":"Stop","session_id":"t"}' | packages/collector/hook/send.sh` → aparece una línea nueva en `data/events/<hoy>.jsonl`.
- Con el colector apagado: `time (echo '{}' | send.sh)` tarda menos de 1,2 s y termina con código 0.
- `npm run hooks:install` dos veces, luego `diff` entre el `settings.json` resultante y la copia: solo se añaden nuestras entradas y los hooks `consultar-cerebro.py` y `aplicar-molde.py` siguen.
- Escenario 6 con una sesión real de la app de escritorio.
- `npm run hooks:uninstall` → `settings.json` queda igual que la copia (salvo el formato).
- E2E: no existe un harness E2E; basta con los tests de integración del endpoint y del instalador, más el escenario 6 manual.

## Evidencia a guardar

- Salida de `./init.sh`.
- Resumen del `diff` del `settings.json` tras instalar.
- Lista de los `hook_event_name` distintos observados en una sesión real y el valor de `notification_type` (sin el contenido de los prompts).
- Tiempo de `send.sh` con el colector apagado.

## Checklist del validador

- [ ] Los hooks ajenos del usuario siguen intactos tras instalar y desinstalar.
- [ ] Se crea copia de seguridad y la escritura es atómica.
- [ ] `send.sh` nunca devuelve un código distinto de 0 ni escribe en stdout.
- [ ] `data/` está ignorado y nada sale de la máquina.
- [ ] Escenarios 1 a 6 con evidencia.
- [ ] No se añadió interpretación de estados ni WebSocket.
