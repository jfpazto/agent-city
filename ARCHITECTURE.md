# Arquitectura

Monorepo npm (workspaces) con tres paquetes:

| Paquete | Qué es | Arranque |
|---|---|---|
| `packages/shared` | Tipos TypeScript compartidos, sin compilar | — |
| `packages/collector` | Servidor Node (`node:http`, ejecutado con `tsx`) que recibe los hooks y lee los transcripts | `127.0.0.1:4317` (`COLLECTOR_PORT`) |
| `packages/web` | Front Vite + TypeScript + PixiJS v8 | `localhost:5173` |

## Dirección de dependencias
- `web` → `shared` y `collector` → `shared`.
- `web` nunca importa de `collector`: se comunican solo por red (HTTP y, más adelante, WebSocket).

## Flujo de eventos
Hook de Claude Code → `packages/collector/hook/send.sh` (curl, timeout de 1 s, siempre exit 0) → `POST /hook` (rechaza peticiones con Origin o sin `application/json`) → `data/events/AAAA-MM-DD.jsonl` (ignorado por git; solo metadatos, sin prompts ni `tool_input` salvo `CIUDAD_EVENTS_FULL=1`; se borran los días con más de `CIUDAD_EVENTS_DAYS`, 7 por defecto). Los hooks se instalan y desinstalan con `npm run hooks:install|uninstall`, que conserva los hooks ajenos y deja copia `.bak-*`. Codex usa el mismo `send.sh` con argumento (`send.sh codex` → `POST /hook?agent=codex`), instalado en `~/.codex/hooks.json` (`CODEX_HOOKS_PATH`) con `npm run hooks:install:codex|uninstall:codex`; cada línea del log guarda `agent` (`claude` o `codex`; las antiguas sin campo son de Claude) y los eventos de Codex solo se registran: no tocan el store ni el WebSocket.

El store de sesiones (`collector/src/sessions.ts`) vive en memoria, se alimenta desde `/hook` con un `reduce` puro y se expone en `GET /sessions`. Tras cada evento (y en cada revisión periódica) el colector lee de forma incremental el transcript de la sesión (`collector/src/transcript.ts`: offset en bytes, cada `message.id` una vez, solo `.jsonl` bajo `~/.claude/projects` o `CIUDAD_TRANSCRIPTS_DIR`) y publica `model`, `tokens`, `tools` (comandos, lecturas, web), `editedFiles` y `costUsd` (tabla de precios en `collector/src/pricing.ts`, con fuente y fecha, sustituible con `CIUDAD_PRICES_FILE`; cada modelo de la sesión a su precio). Al arrancar (`main.ts` → `createServer({ coldStart: true })`), los transcripts de primer nivel con actividad en los últimos 2 días (`CIUDAD_CLAUDE_DAYS`) se siembran como sesiones dormidas con sus métricas (`store.seed`, que no pisa sesiones vivas). El lector de transcripts también produce `log` (bitácora, máx. 20 acciones sin contenido) y `daily` (tokens por día local, 7 días). `POST /sessions/:id/new` abre una sesión nueva del mismo agente en la raíz del proyecto de :id (`claude://code/new?folder=` o `codex://threads/new?path=`, Terminal de respaldo; la carpeta sale del store, nunca de la petición). `POST /sessions/:id/delete` mueve el transcript (y su carpeta hermana `<id>/`) a la papelera del sistema con `collector/src/trash.ts` (`~/.Trash` en macOS, freedesktop en Linux, Papelera de reciclaje vía PowerShell en Windows), solo dentro de `~/.claude/projects` o `~/.codex/sessions`, y la retira del store; 409 si está trabajando o esperando permiso. Ambas exigen Origin local explícito. `POST /sessions/:id/reviewed` pasa una sesión de `para_revisar` a `dormida` (403 para orígenes no locales); el front lo llama al abrir el panel. `GET /history?day=AAAA-MM-DD[&step=s]` (`collector/src/history.ts`) reconstruye un día de Claude repitiendo `data/events` con un store nuevo (mismo `reduce` y misma inactividad, un día previo de calentamiento) y devuelve un fotograma cada 5 min con el estado más urgente de cada sesión en su intervalo; CORS solo para orígenes locales. El front lo usa en el modo «Rebobinar» (`web/src/world/replay.ts`).

## Límites de uso

`collector/src/usage.ts` guarda el último límite por proveedor (ventanas de 5 h y semanal: `usedPercent`, `resetsAt`, `observedAt`) en `data/usage.json` (solo con coldStart; `usageFile` en tests). Un dato solo sustituye a otro más antiguo.
- Codex: `parseRollout` lee `rate_limits` de los eventos `token_count` (`primary`/`secondary` por `window_minutes`: 300 → 5 h, 10080 → semanal). El sondeo publica el de cualquier rollout, también de subagentes: es de la cuenta.
- Claude: la statusline `collector/hook/statusline.sh` (instalada con `npm run hooks:install` solo si no hay otra; curl de 1 s, exit 0) reenvía su JSON a `POST /usage/claude`. El colector guarda solo `rate_limits.five_hour|seven_day` y el `context_window.used_percentage` de la sesión (en memoria), y descarta el resto sin escribirlo. Mismo criterio de Origin que el WebSocket.

En el front, `world/usage.ts` (puro) decide el estado de cada ventana en el momento (`ok`, `bajo` < 20 %, `agotado`, `recargado` si pasó `resetsAt`, `sin_dato` si falta o tiene más de 6 h / 7 días). `MapView.setUsage` dibuja el depósito y el embalse (Claude) o la central con batería y pilas (Codex) en la franja de rótulo, en una capa propia; `WorldUI` pone el texto corto y la frase completa para lectores de pantalla. Se recalcula cada 30 s.

## Protocolo WebSocket
`ws://127.0.0.1:4317/ws` (hub en `collector/src/wsHub.ts`; cliente en `web/src/stateClient.ts`). Mensajes del servidor, tipados como `ServerMessage` en `shared`:
- `{type:"snapshot", sessions, usage}`: siempre el primero, al conectar.
- `{type:"usage", limits}`: nuevo límite de uso de un proveedor (no repinta las sesiones).
- `{type:"session", session}`: alta o cambio real de una sesión.
- `{type:"removed", id}`: la sesión terminó.

El cliente no envía mensajes. Se reconecta con espera creciente (0,5 s → 5 s).

## Front

El colector publica `Session.project` (id, nombre, raíz y orden) y `projectFloor`. `collector/src/projects.ts` resuelve `.git` y `commondir` para agrupar raíz, subcarpetas y worktrees; los homónimos no se mezclan. El store conserva pisos locales y el índice global `floor`. El front admite además `Session.agent?: claude|codex`: ausente equivale a Claude. Las sesiones de Codex las crea `collector/src/codex.ts`: cada 3 s se releen los rollouts cambiados de `~/.codex/sessions` (`CIUDAD_CODEX_DIR`, ventana `CIUDAD_CODEX_DAYS`, 7 días) y se publican con `agent: "codex"` (`store.upsertCodex`); los subagentes se omiten. No se deduce el proveedor del modelo o del título.

### Mapa y navegación

- `web/src/world/model.ts`: funciones puras de agrupación `(proveedor, project.id)`, solares estables, manzanas, puentes y recorridos. Tres columnas por barrio, crecimiento en filas; los edificios se ordenan por actividad reciente (desde la sesión 041).
- `world/camera.ts`: ajuste de ciudad/barrio, límites y zoom hacia el cursor. Cámara del mapa separada de la fachada, conservada al entrar y volver.
- `world/MapView.ts`: geometría estática de Pixi (suelo, calles, azoteas, árboles, puentes), con sprites separados para tráfico y recorridos ambientales. El frame mueve sprites y opacidades; no reconstruye la ciudad.
- `world/WorldUI.ts`: controles, selectores accesibles, nombres de azoteas en HTML y panel de relaciones. Mantiene los nodos de rótulos y opciones entre cambios de métricas para conservar el foco. Textos por `textContent` u opciones nativas.
- `main.ts`: integra las vistas mapa/fachada, dos cámaras, conexión WS, búsqueda, panel y urgentes. Calcula el hueco disponible a partir de la altura real de la navegación. El selector de sesión y el clic de piso abren el panel existente; el buscador, la pancarta y el aviso revelan la fachada de la sesión correcta.

La fachada usa `tower/city.ts` y `TowerView.ts`, filtrada a un único proyecto/proveedor y centrada sin el orden global de solares. Los pisos se compactan por `lastEventAt` (la más antigua abajo, la más reciente arriba, sin huecos: un único piso «en venta», encima); se conservan iluminación y bocadillos, con lateral, azotea e interiores. En escritorio el panel deja espacio a la fachada; en pantallas pequeñas se superpone. `tower/layout.ts` conserva estilos, helpers y la disposición histórica usada por tests anteriores.

### Relaciones y almacenamiento local

`world/preferences.ts` valida y guarda solares por proveedor, relaciones manuales y preferencia de movimiento en `localStorage` (`ciudad.neighborhoods.v1`). No hay endpoints nuevos. Almacenamiento corrupto/bloqueado: fallback en memoria; si no puede guardarse una relación se avisa al usuario. Los solares persisten en ese navegador/origen aunque reinicie el colector; los índices de piso siguen siendo reconstruidos por el colector al reiniciar.

Mismo `project.id` en dos proveedores produce un puente automático. Los demás vínculos solo se crean por acción explícita del usuario. La relación manual es entre proyectos; se dibuja una pasarela por proveedor común o entre barrios si no comparten proveedor. Sin extremos activos no se dibuja, pero el vínculo se guarda. No se leen conversaciones para inferir colaboración y los puentes no envían mensajes.

### Animación y demostración

Ticker a 30 fps; pestaña oculta lo detiene. Vida y `prefers-reduced-motion` congelan movimiento ambiental, trabajadores, brillo variable y avioneta (pancarta estática). El temporizador de urgentes y los avisos continúan independientes del ticker.

`?demo=N&projects=P` genera sesiones ficticias repartidas entre ambos proveedores, sin WebSocket. Hay identidad compartida para probar puentes entre barrios; sus preferencias usan otra clave `.demo` para no mezclar proyectos reales. `?demo=0` muestra barrios vacíos; el límite de demo es 500 sesiones. En producción normal no se inventan sesiones para llenar el barrio Codex.

## Arranque
`npm run dev` levanta colector y front. Con `npm run autostart:install`, un LaunchAgent de usuario (`scripts/autostart.sh`) mantiene el colector siempre encendido; entonces el front se arranca solo con `npm run dev:web`.

## Reglas
- El WebSocket rechaza con 403 cualquier `Origin` que no sea `http://localhost` o `http://127.0.0.1`, para que una web ajena abierta en el navegador no pueda leer el estado. Sin `Origin` (tests, node) se acepta.
- El colector escucha solo en `127.0.0.1`.
- `createServer()` (en `collector/src/server.ts`) no abre ningún puerto; `main.ts` lo arranca. Los tests lo levantan en el puerto 0.
- Tests con `vitest` desde la raíz; typecheck con `tsc` en cada paquete.
