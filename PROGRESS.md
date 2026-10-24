# Registro de progreso

## Estado verificado actual

- Raíz del repositorio: `<carpeta del repo>`
- Arranque estándar: `./init.sh`
- Verificación estándar: `./init.sh` (`npm run typecheck` + `npm test`); arranque con `npm run dev`
- Implementadas y passing: `project-buildings` y `city-neighborhood-map`, pendientes de validación independiente. Ciudad superior 2.5D, barrios por proveedor, fachadas por proyecto, vida ambiental y puentes. `codex-sessions` passing (lee los rollouts de `~/.codex/sessions`); `codex-event-probe` (hooks, para el rojo de Codex) sigue pendiente.
- `usage-limits` passing (pendiente de validación independiente): depósito (Claude) y central (Codex) con lo que queda del límite de uso.
- Bloqueos: ninguno. Statusline instalada el 2026-10-21; el depósito de Claude ya muestra datos reales.
- Última verificación: 2026-10-21 (`./init.sh` en verde, 212/212 tests en 35 archivos y typecheck)

## Registro de sesiones

### Sesión 001

- Fecha: 2026-10-19
- Objetivo: analizar el video de referencia, escribir el brief y preparar el harness mínimo.
- Hecho: documentos del brief (`CONTEXT.md`, `docs/*`, `DESIGN.md`), `AGENTS.md`, `init.sh`, `PROGRESS.md` y `feature_list.json`.
- Verificación: JSON válido, dependencias comprobadas y `./init.sh` ejecutado.
- Riesgo: los eventos de hook de la app de escritorio no se habían comprobado todavía (resuelto en la sesión 004).
- Siguiente paso: usar `feature-spec` con `bootstrap-monorepo`.

### Sesión 002

- Fecha: 2026-10-19
- Objetivo: implementar `bootstrap-monorepo` según `docs/specs/bootstrap-monorepo.md`.
- Hecho: monorepo con `shared`, `collector` (/health y 404) y `web` (canvas de Pixi); `init.sh` con bootstrap; `ARCHITECTURE.md`; actualizados `AGENTS.md` y `docs/technical-discovery.md`.
- Verificación: `./init.sh` (2/2 tests), `curl` a /health y /nope, `lsof` en 127.0.0.1 y canvas comprobado en el navegador.
- Riesgo: npm bloqueó el postinstall de esbuild (`npm install-scripts`); por ahora vite funciona igual.
- Siguiente paso: usar `feature-validator` con `bootstrap-monorepo`.

### Sesión 003

- Fecha: 2026-10-19
- Objetivo: validación independiente de `bootstrap-monorepo`.
- Resultado: accept, la feature pasa a `accepted`.
- Hallazgos menores: `@types/node` no figuraba en la spec (está justificada); npm bloqueó el postinstall de esbuild (sigue vigilado); `/health` compara la URL exacta.
- Siguiente paso: usar `feature-spec` con `hook-event-probe`.

### Sesión 004

- Fecha: 2026-10-19
- Objetivo: implementar `hook-event-probe`.
- Hecho: `POST /hook` con log diario en `data/events`, `send.sh`, instalador `hooks:install`/`hooks:uninstall` (conserva los hooks ajenos, deja copia y escribe de forma atómica). Instalado en `~/.claude/settings.json`.
- Verificación: 9/9 tests y eventos reales de la app de escritorio, incluida una petición de permiso.
- Hallazgo: el rojo debe dispararse con `PermissionRequest`; `Notification` llega unos 6 s más tarde y solo si no se ha aprobado antes.
- Riesgo: el colector tiene que estar arrancado (`npm run dev` o `npx tsx packages/collector/src/main.ts`); si no, los eventos se pierden sin hacer ruido.
- Siguiente paso: usar `feature-validator` con `hook-event-probe`.

### Sesión 005

- Fecha: 2026-10-19
- Objetivo: validación independiente de `hook-event-probe`.
- Resultado: accept, la feature pasa a `accepted`. Notas aplicadas: corregida la línea de riesgo de la sesión 001 y añadido el riesgo de privacidad de `data/events`.
- Siguiente paso: usar `feature-spec` con `session-state-machine`.

### Sesión 006

- Fecha: 2026-10-19
- Objetivo: implementar `session-state-machine`.
- Hecho: `reduce` puro, store con plantas, `/hook` alimenta el store, `GET /sessions` y tipos en `shared`.
- Verificación: 21/21 tests y sesión real con tres permisos; reproducción del log con el reducer final.
- Hallazgo: con herramientas en paralelo el rojo se apagaba antes de tiempo; corregido emparejando por `tool_use_id`.
- Siguiente paso: usar `feature-validator` con `session-state-machine`.

### Sesión 007

- Fecha: 2026-10-19
- Objetivo: arreglar los hallazgos de la validación (revise) de `session-state-machine`.
- Hecho: permiso denegado resuelto con `PostToolUseFailure` o con una llamada nueva de la misma herramienta; `session_id` validado como texto; `PostToolUseFailure` añadido al instalador y reinstalado; tablas de `domain-model` y de la spec alineadas con `reduce()`; casos límite documentados.
- Verificación: 23/23 tests y reproducción del log real.
- Siguiente paso: volver a pasar `feature-validator`.

### Sesión 008

- Fecha: 2026-10-19
- Objetivo: segunda validación de `session-state-machine`.
- Resultado: accept, la feature pasa a `accepted`. Matices aplicados: la fila `PreToolUse` menciona `tool:<nombre>` y `apply` comprueba que el id sea texto.
- Siguiente paso: usar `feature-spec` con `idle-timeout`, o con `ws-state-stream` si se prefiere ver la torre antes.

### Sesión 009

- Fecha: 2026-10-19
- Objetivo: implementar `ws-state-stream`.
- Hecho: `subscribe` en el store, hub WS en `/ws` (snapshot, session, removed; 403 para orígenes ajenos), `stateClient.ts` con reconexión y texto de depuración provisional en el front.
- Verificación: 28/28 tests, prueba en el navegador con un evento sintético, reconexión comprobada con lsof y 403 con curl.
- Nota: con el panel del navegador oculto, Pixi no repinta. Para comprobaciones visuales, el panel tiene que estar visible.
- Siguiente paso: usar `feature-validator` con `ws-state-stream`.

### Sesión 010

- Fecha: 2026-10-19
- Objetivo: validación de `ws-state-stream` y corrección de sus hallazgos menores.
- Resultado: accept, la feature pasa a `accepted`. Corregido el cuelgue de `server.close()` con clientes WS abiertos y el error del front con mensajes malformados (`applyMessage`). Primer test del paquete web.
- Verificación: 31/31.
- Siguiente paso: usar `feature-spec` con `tower-render-floors`.

### Sesión 011

- Fecha: 2026-10-19
- Objetivo: poder probar a mano en cualquier momento y no perder eventos.
- Hecho: `docs/pruebas-manuales.md` (con la regla en `AGENTS.md` de mantenerla al día), `scripts/autostart.sh` con `npm run autostart:install|uninstall|status` y `npm run dev:web`.
- Pendiente del usuario: ejecutar `npm run autostart:install`. El instalador no se ejecutó desde la sesión porque el clasificador de permisos lo bloqueó como persistencia.
- Siguiente paso: `tower-render-floors` (la spec ya está escrita).

### Sesión 012

- Fecha: 2026-10-19
- Objetivo: implementar `tower-render-floors`.
- Hecho: `tower/layout.ts` (disposición pura), `tower/TowerView.ts` (dibujo con Pixi), `main.ts` sin texto de depuración, línea de conexión y modo `?demo=N`. Actualizados `ARCHITECTURE.md`, `DESIGN.md` (fuente pendiente) y `docs/pruebas-manuales.md`. Añadido `.claude/launch.json` para el preview.
- Verificación: 42/42 tests; capturas de `?demo=0/3/14`; escenario 5 con sesiones sintéticas y recarga; redimensionado a 768 px.
- Siguiente paso: usar `feature-validator` con `tower-render-floors`.

### Sesión 013

- Fecha: 2026-10-19
- Objetivo: validación independiente de `tower-render-floors`.
- Resultado: accept, la feature pasa a `accepted`. 42/42 tests; reglas de disposición, colores y alcance correctos.
- Notas menores sin arreglar: una planta negativa o no entera se descarta en silencio y dos sesiones con la misma planta se pisan sin aviso (sin tests); `.claude/launch.json` añadido fuera de la spec.
- Siguiente paso: usar `feature-spec` con `idle-timeout` (o `floor-state-colors` para seguir con lo visual).

### Sesión 014

- Fecha: 2026-10-19
- Objetivo: implementar `idle-timeout` (en paralelo con `floor-state-colors` en otra sesión).
- Hecho: spec `docs/specs/idle-timeout.md`; `expire()` puro y `store.tick(now)` en `sessions.ts`; intervalo en `server.ts` (min(30 s, timeout/2), se para al cerrar); `CIUDAD_IDLE_MINUTES` (30 por defecto). `te_necesita` nunca se duerme.
- Verificación: 40/40 tests y prueba real en el puerto 4399 con timeout de 3 s (sección 8 de `docs/pruebas-manuales.md`).
- Siguiente paso: usar `feature-validator` con `idle-timeout`.

### Sesión 015

- Fecha: 2026-10-19
- Objetivo: implementar `floor-state-colors` (en paralelo con `idle-timeout` en otra sesión; aquí solo front).
- Hecho: spec `docs/specs/floor-state-colors.md`; `STATE_STYLE`, iconos pixel 7×7, `blinkAlpha` y `glowAlpha` puros en `layout.ts`; `TowerView` pinta brillo del estado, chip con icono y etiqueta, y `tick()` hace parpadear solo el rojo desde el ticker de `main.ts`.
- Verificación: 48/48 tests; capturas de `?demo=4` en el navegador integrado (puerto 5174) con los cuatro estados y el parpadeo; consola sin errores.
- Prueba con sesiones reales: confirmada por el usuario.
- Siguiente paso: usar `feature-validator` con `floor-state-colors`.

### Sesión 016

- Fecha: 2026-10-19
- Objetivo: fusionar `idle-timeout` y `floor-state-colors` en main y validarlas.
- Hecho: fusión con conflictos de `PROGRESS.md` resueltos; `vitest.config.ts` excluye `.claude/**` para no ejecutar los tests de los worktrees (57/57).
- `idle-timeout`: accept, pasa a `accepted`. Notas menores: falta un test WS de punta a punta del cambio a `dormida`, `tickMs` sin mínimo y `idleMs` NaN sin comprobar en `createServer`.
- `floor-state-colors`: revise. El código cumple la spec y DESIGN.md; falta la prueba con sesiones reales (rojo en < 2 s al pedir permiso, verde al aprobar, amarillo al terminar). Baja: import duplicado en `TowerView.ts:4`.
- Siguiente paso: hacer la prueba real de `floor-state-colors`, anotarla y revalidar.

### Sesión 017

- Fecha: 2026-10-19
- Objetivo: prueba real y revalidación de `floor-state-colors` (tras el revise de la 016).
- Resultado: accept por un validador independiente; la feature pasa a `accepted`. Hallazgos menores sin arreglar: imports duplicados de `@ciudad/shared` en `TowerView.ts`, la etiqueta del chip no tiene test de ancho, fondo del título añadido fuera de la spec.
- Siguiente paso: `needs-you-bubble` (depende de esta).

### Sesión 018 (validación de idle-timeout en su rama, antes de la fusión)

- Fecha: 2026-10-19
- Objetivo: validar `idle-timeout`.
- Resultado: accept, la feature pasa a `accepted`. Matiz: el escenario 7 de la spec se cubre con un test del intervalo y la prueba real, no con un test de cliente WS (el hub reenvía todos los avisos del store). La validación no fue independiente: la hizo la sesión que implementó.

### Sesión 019

- Fecha: 2026-10-19
- Objetivo: fusionar en main `floor-state-colors` e `idle-timeout` e implementar `needs-you-bubble`.
- Hecho: ramas fusionadas en main (conflictos de `PROGRESS.md` y `feature_list.json` resueltos conservando ambas entradas; 57/57). Spec `docs/specs/needs-you-bubble.md`; `wrapText` y `bubbleFor` puros; bocadillo dentro del piso rojo; el modo demo lleva mensaje. De paso, unido el import duplicado de `@ciudad/shared` en `TowerView.ts` (hallazgo del validador).
- Verificación: 62/62; captura de `?demo=4` con el bocadillo; consola sin errores.
- Prueba con un permiso real: confirmada por el usuario.

### Sesión 020

- Fecha: 2026-10-19
- Objetivo: implementar `tower-scroll-zoom`.
- Hecho: spec `docs/specs/tower-scroll-zoom.md`; `tower/camera.ts` puro (límites, scroll, zoom hacia el cursor); rueda = scroll vertical y Ctrl/⌘ + rueda = zoom en `main.ts`.
- Verificación: 68/68; `?demo=40` con capturas abajo, en el tejado y alejada; 60 fps durante el scroll; consola sin errores.
- Siguiente paso: `feature-validator` con `needs-you-bubble` (tras la prueba con un permiso real) y con `tower-scroll-zoom`.

### Sesión 021

- Fecha: 2026-10-19
- Objetivo: validar `needs-you-bubble` y `tower-scroll-zoom`.
- Resultado: accept de un validador independiente para las dos; pasan a `accepted` y se fusionan en main. Menores sin arreglar: el bocadillo tapa 6 px del recuadro de iniciales; la rueda siempre hace `preventDefault`; `zoomAt` supone que el canvas ocupa la ventana.
- Siguiente paso: `transcript-token-parser` (colector), que desbloquea coste, recuentos, barra de estado y panel.

### Sesión 022

- Fecha: 2026-10-19
- Objetivo: implementar `transcript-token-parser`.
- Hecho: spec `docs/specs/transcript-token-parser.md`; `collector/src/transcript.ts` (acumulador puro deduplicado por `message.id`, lector incremental por bytes con cola por archivo y lista blanca de rutas); `Session` gana `model` y `tokens`; `store.setMetrics`; lectura tras cada `/hook` y en cada `tick`. `ARCHITECTURE.md` y `docs/pruebas-manuales.md` (§9) actualizados.
- Hallazgo: Claude Code repite el mismo `message.id` con el mismo `usage` en varias líneas (36 de 56 ids en una sesión real). Sin deduplicar, los tokens salen inflados.
- Verificación: 77/77; transcript real comparado con una suma a mano: idéntico.
- Siguiente paso: `feature-validator` con `transcript-token-parser`.

### Sesión 023

- Fecha: 2026-10-19
- Objetivo: validar `transcript-token-parser`.
- Resultado: accept de un validador independiente; pasa a `accepted` y se fusiona en main. Bajos sin arreglar: `isAllowedTranscript` sin `realpath`, mapas del lector que no se vacían al retirar sesiones, el `tick` relee también las dormidas.
- Siguiente paso: `cost-estimate` o `transcript-tool-counts` (colector) o `status-bar-counters` (front), ya desbloqueadas.

### Sesión 024

- Fecha: 2026-10-19
- Objetivo: implementar `cost-estimate` y `transcript-tool-counts`.
- Hecho: `collector/src/pricing.ts` (tabla con fuente y fecha, `CIUDAD_PRICES_FILE`, coste por modelo); el lector de transcripts acumula tokens por modelo, recuento de herramientas por `tool_use.id` y archivos editados; `Session` gana `costUsd`, `tools` y `editedFiles`; `setMetrics` compara todos los campos de métricas. Specs en `docs/specs/`.
- Verificación: 87/87; transcript real: coste, recuentos y archivos idénticos al cálculo a mano.
- Siguiente paso: `status-bar-counters`.

### Sesión 025

- Fecha: 2026-10-19
- Objetivo: implementar `status-bar-counters`.
- Hecho: `web/src/hud/summary.ts` (puro) y `StatusBar.ts`: barra fija con un chip por estado (icono, número, etiqueta) y tokens totales; el tope del scroll deja hueco para la barra; el modo demo lleva tokens.
- Verificación: 90/90; barra comparada con `GET /sessions` de un colector propio en 4397, también tras cambios en vivo.
- Siguiente paso: validar `cost-estimate`, `transcript-tool-counts` y `status-bar-counters` y fusionar en main.

### Sesión 026

- Fecha: 2026-10-19
- Objetivo: validar `cost-estimate`, `transcript-tool-counts` y `status-bar-counters`.
- Resultado: `transcript-tool-counts` y `status-bar-counters`, accept. `cost-estimate`, revise: la caché de 1 h se cobraba como la de 5 min (~8 % de menos) y el precio por prefijo daba precio a modelos nuevos. Corregido (caché de 1 h a 2 × entrada, solo sufijos de fecha), con tests y nueva comparación real (28,749307 $ igual a mano). De paso, `formatTokens` ya no muestra «1000,0 k».
- Siguiente paso: revalidar `cost-estimate` y fusionar en main.

### Sesión 027

- Fecha: 2026-10-19
- Objetivo: revalidar `cost-estimate` y fusionar las tres en main.
- Resultado: `cost-estimate` accept en la revalidación independiente; `cost-estimate`, `transcript-tool-counts` y `status-bar-counters` pasan a `accepted` y se fusionan en main. Pendiente menor: la barra recrea sus objetos Pixi en cada render.
- Siguiente paso: `cold-start-rebuild` (colector) o `detail-panel-metrics` (front), ya desbloqueadas.

### Sesión 028

- Fecha: 2026-10-19
- Objetivo: implementar `cold-start-rebuild`.
- Hecho: `findRecentTranscripts`, `store.seed` y `coldStart` (solo desde `main.ts`); el lector de transcripts recoge `cwd` y título (`custom-title`).
- Verificación: 97/97; `main.ts` real reconstruye 23 sesiones = transcripts de las últimas 24 h.
- Siguiente paso: `floor-search` y `detail-panel-metrics`.

### Sesión 029

- Fecha: 2026-10-19
- Objetivo: implementar `floor-search`.
- Hecho: buscador HTML accesible en la barra; `matchSessions`/`nextMatch` puros; `centerOn` en la cámara; marco de acento en el piso encontrado; Intro, Esc y «/».
- Verificación: 102/102; prueba con 23 sesiones reales reconstruidas.
- Siguiente paso: `detail-panel-metrics`.

### Sesión 030

- Fecha: 2026-10-19
- Objetivo: implementar `detail-panel-metrics`.
- Hecho: panel HTML a la derecha (`web/src/panel/`), clic en piso (`sessionAt` puro), Esc/✕, botón «Abrir» junto al buscador para usarlo con teclado, foco devuelto al cerrar, actualización en vivo, «—» sin dato.
- Verificación: 108/108; panel = GET /sessions campo a campo con una sesión real; recorrido completo con teclado.
- Siguiente paso: validar `cold-start-rebuild`, `floor-search` y `detail-panel-metrics` y fusionar en main.

### Sesión 031

- Fecha: 2026-10-19
- Objetivo: validar `cold-start-rebuild`, `floor-search` y `detail-panel-metrics` y fusionar en main.
- Resultado: accept del validador independiente para las tres; pasan a `accepted` y se fusionan en main.
- Deuda menor: contador del buscador desfasado hasta la siguiente tecla si llegan sesiones; foco del input solo por color; panel `role=dialog` no modal; la barra recrea objetos Pixi en cada render; `isAllowedTranscript` sin `realpath`.
- Siguiente paso: features del panel (`detail-panel-log`, `detail-panel-weekly-chart`, `quick-replies-copy`, `open-session-link`, `review-clears-on-open`).

### Sesión 032

- Fecha: 2026-10-19
- Objetivo: implementar las features del panel `review-clears-on-open`, `detail-panel-log`, `detail-panel-weekly-chart`, `quick-replies-copy` y `open-session-link`.
- Hecho: `POST /sessions/:id/reviewed` (`review`, `store.markReviewed`, `handleReviewed`) y llamada desde `openPanel`; bitácora y tokens por día en el lector de transcripts (`Session.log`, `Session.daily`); panel con bitácora, 7 barras, respuestas rápidas al portapapeles y «Abrir sesión» que copia título, carpeta e id (sin deep link utilizable, ver `docs/risks-and-open-questions.md`). Arreglo de deuda: el buscador recalcula resultados cuando llegan sesiones por WS (`refreshSearch`/`updateSearchStatus`). Specs en `docs/specs/`.
- Verificación: 122/122; Stop sintético → abrir panel → dormida en barra y `GET /sessions`; bitácora y tokens de hoy = recuento independiente en Python; copia comprobada con `pbpaste`. Pendiente: probar «Abrir sesión» con la app real.
- Siguiente paso: validar las cinco y fusionar en main.

### Sesión 033

- Fecha: 2026-10-19
- Objetivo: validar las cinco features del panel (con validadores en paralelo) y fusionar en main.
- Resultado: accept para las cinco. `review-clears-on-open` salió primero en revise (id mal codificado podía tumbar el colector) y se corrigió; el gráfico semanal ahora rotula «hoy».
- Pendiente del usuario: probar «Abrir sesión» con la app real (pegar el texto copiado en la búsqueda de la app).
- Deuda menor: nombre del botón «Abrir sesión» (solo copia); sin test automático del respaldo del portapapeles; barras desplazadas si el panel sigue abierto al pasar la medianoche.
- Siguiente paso: todas las features del MVP están `accepted`.

### Sesión 034

- Fecha: 2026-10-19
- Objetivo: implementar `urgent-selector`, `urgent-plane` y `urgent-notification` (fase 1 posterior al MVP).
- Hecho: `urgent-selector`: `web/src/urgent/urgent.ts` puro (`trackRed`, `urgentSessions`, `urgentThreshold`; `?urgentMs=N` solo en desarrollo), integrado en `main.ts`. `urgent-plane`: `PlaneView` (Graphics + Text de Pixi) y `bannerText`/`planeX` puros; clic en la pancarta gestionado en el `pointerup` del canvas → `centerFloor` (reusa `centerOn`, también para el buscador).
- Verificación: 133/133; avioneta real con colector propio en 4395 y Vite en 5174 (umbral real de 60 s); clic centra el piso rojo; sin urgentes desaparece.
- `urgent-notification`: `notify.ts` puro (`decideNotify`, `notificationContent`, `notifyButton`), botón «Activar avisos» en la barra y `new Notification` con clic → foco + centrar. 137/137. El navegador integrado tiene los avisos denegados (botón «Avisos bloqueados», nada se rompe); la secuencia se comprobó sustituyendo `window.Notification` por un registro: 3 avisos (primero, nuevo episodio, agrupado de 2) y ninguno mientras seguía en rojo.
- Pendiente del usuario: conceder el permiso en su navegador y ver un aviso de verdad (y su clic).
- Siguiente paso: validar las tres features con `feature-validator` y fusionar en main.

### Sesión 035

- Fecha: 2026-10-19
- Objetivo: validar `urgent-selector`, `urgent-plane` y `urgent-notification` y fusionar en main.
- Resultado: accept de validadores independientes para las tres; pasan a `accepted`.
- Pendiente del usuario: probar el aviso real del sistema y su clic (sección 13 de `docs/pruebas-manuales.md`).
- Deuda menor: soltar un arrastre de cámara encima de la pancarta centra el piso urgente (`main.ts`, el clic se comprueba antes del filtro de arrastre).
- Siguiente paso: fase 2 (historial en SQLite y barra para rebobinar el día).

### Sesión 017

- Fecha: 2026-10-19
- Objetivo: preparar la integración con Codex CLI.
- Hecho: features `codex-event-probe` y `codex-sessions` en `feature_list.json`; spec `docs/specs/codex-event-probe.md`.
- Hallazgo: según las cadenas del binario de Codex 0.163.0, los hooks usan un `hooks.json` con el mismo esquema y casi los mismos eventos y campos que Claude (más `PostCompact`, `SubagentStart` e `Interrupt`). Además, `codex queue` permite encolar mensajes en una sesión existente. Queda por confirmar con la sonda.
- Siguiente paso: implementar `codex-event-probe`.

### Sesión 036

- Fecha: 2026-10-19
- Objetivo: sustituir la torre única por un edificio por proyecto/agente, con sesiones por pisos.
- Decisión del usuario: documentos en español; proyecto Git como edificio; «agente» designa el proyecto, no una sesión.
- Base verificada: `./init.sh` en verde (137/137).
- Hecho: identidad por metadatos Git comunes (subcarpetas, enlaces y worktrees); `Session.project` y `projectFloor`, orden de edificio estable durante la vida del colector; ciudad de edificios rotulados con una sesión por piso; búsqueda por proyecto o título; panel con proyecto; cámara en ambos ejes y arrastre; controles en segunda fila en ventanas estrechas. Spec: `docs/specs/project-buildings.md`.
- Verificación final: `./init.sh` en verde, 147/147 tests y typecheck; `git diff --check` limpio. Diez nuevos tests cubren identidad, store, disposición, recarga y navegación/selección con zoom.
- Integración: colector aparte en 4394 reconstruye 25 sesiones en 10 edificios. Eventos desde el checkout real y un worktree de FrontAgentico comparten edificio con pisos 5 y 6; sesiones sintéticas retiradas.
- Navegador (741 × 827): tres edificios, arrastre hasta el tercero, búsqueda por proyecto y panel; FrontAgentico real da 1/5 y conserva métricas, consola sin errores; ciudad vacía y edificio de veinte sesiones recorrido hasta la azotea. Captura demo sin datos reales: `docs/design/evidence/project-buildings.png`.
- Operación: reiniciado el colector habitual mediante `launchctl kickstart` del servicio existente (sin reinstalar ni cambiar configuración). En 4317: 25 sesiones, 10 edificios, sin colisiones de pisos; FrontAgentico tiene cinco sesiones en un edificio. Parados los servidores temporales 4394/5174; el front habitual sigue en 5173.
- Documentación: vocabulario, modelo, brief, diseño, arquitectura, discovery técnico, AGENTS y pruebas manuales alineados. No se cambian comandos de verificación ni hooks.
- Límites: posiciones en memoria (se reconstruyen al reiniciar el colector); cambios de repositorio en la misma carpeta requieren reiniciar por la caché; colectores antiguos agrupan por carpeta hasta actualizarse.
- Estado: `passing`, pendiente validación independiente. No se ha iniciado la integración con Codex.

### Sesión 037 — dirección visual de la ciudad

- Fecha: 2026-10-19.
- Decisión del usuario: elige «Barrio 2.5D» y añade mapa superior por manzanas, con barrios separados para Claude y Codex; al entrar se ven el edificio de frente y las sesiones por pisos.
- Caso mixto confirmado: si un proyecto tiene sesiones de ambos proveedores, aparece un edificio en cada barrio; solo se muestran las sesiones de ese proveedor. Proyecto/agente sigue siendo el repositorio, no el proveedor.
- Propuesta interactiva con datos ficticios: navegación por ciudad/Claude/Codex, arrastre y zoom, entrada por azotea/nombre, selección de piso, panel, regreso al mapa conservando cámara y salto del mismo proyecto entre proveedores. No modifica el front real.
- Comprobación: sintaxis JavaScript verificada; en navegador, FrontAgentico Claude muestra tres sesiones, Codex dos distintas; cambiar de barrio y elegir el piso rojo actualiza el panel. Consola sin errores.
- Referencias: `docs/design/concepts/neighborhood-map-proposal.png` y `building-front-proposal.png`. Contexto, dominio, brief y DESIGN distinguen diseño objetivo y comportamiento implementado.
- Backlog: añadida `city-neighborhood-map` en not_started, dependiente de project-buildings y codex-sessions; nota en codex-sessions para conservar el origen por proveedor. No se cambian los estados ni la aceptación de las features anteriores.
- No se ha cambiado código de la aplicación ni sus reglas de verificación. Última verificación de la app: 147/147 en la sesión 036; no se vuelve a atribuir esa ejecución a esta sesión de diseño. La guía manual sigue describiendo la app actual.
- Siguiente paso: validar project-buildings; integrar Codex y preparar la spec de city-neighborhood-map con esta dirección.

### Sesión 038 — implementación de barrios y puentes

- Fecha: 2026-10-19.
- Autorización: implementar el diseño aprobado, darle más vida y conectar proyectos relacionados con puentes. Se prioriza esta feature visual sobre la integración real con Codex.
- Base: `./init.sh` en verde, 147/147 y typecheck.
- Alcance: mapa por proveedor/proyecto, entrada a fachada y panel, retorno con cámara conservada, animación ambiental con movimiento reducido, puentes del mismo proyecto entre barrios y relaciones manuales locales. Ninguna relación se infiere del texto de conversaciones.
- Hecho: nuevos módulos `world` para agrupación por proyecto/proveedor, solares estables, cámara, persistencia local, mapa Pixi y controles HTML accesibles. Fachada con volumen e interiores; navegación a pisos, buscador y urgentes conservan el edificio/proveedor correcto. Cámaras de mapa y fachada independientes.
- Vida: coches, personajes, actividad en oficinas y señales; control «Vida», respeto a movimiento reducido y pausa del ticker en pestañas ocultas. Puentes por id de proyecto compartido y relaciones explícitas entre proyectos; no transmiten mensajes. Preferencias y relaciones validadas en localStorage, demos aisladas de los datos reales.
- Verificación: `./init.sh` en verde, 160/160 tests en 25 archivos y typecheck. Trece tests nuevos cubren separación de proveedores, clones, solares, vacío, puentes, recorridos, cámara y almacenamiento corrupto/bloqueado. Sin dependencias nuevas ni cambios en hooks o reglas de verificación.
- Navegador: demo con 24 sesiones, 8 edificios y 4 puentes automáticos. Crear relación manual genera dos pasarelas, persiste tras recarga y se puede quitar conservando las automáticas. «Vida» se congela y vuelve a animar; mapa vacío y fachada de diez pisos comprobados en ventana estrecha.
- Navegación: tras arrastre/zoom, un rótulo conserva exactamente posición y anchura al entrar y volver. Selector abre el panel con métricas; búsqueda por Codex conserva el foco al cerrar el panel y entra al proveedor correcto. Pancarta urgente estática revela el edificio y piso rojos sin abrir el panel automáticamente. Consola sin errores.
- Datos reales: snapshot del colector habitual con 24 sesiones en 10 proyectos Claude; recuentos coinciden con el mapa y barrio Codex vacío. Un proyecto adicional llegó por WebSocket durante la comprobación. Panel real de FrontAgentico conserva métricas y bitácora; no se alteró el estado de revisión para esta prueba.
- Evidencia visual solo con datos ficticios: `docs/design/evidence/city-neighborhood-map.png` y `city-neighborhood-front.png`. Spec y documentos de dominio, diseño, arquitectura y pruebas manuales actualizados.
- Estado: `city-neighborhood-map` passing, pendiente de validación independiente; `project-buildings` conserva passing. La integración real de Codex no está implementada. Sin bloqueos nuevos.
- Siguiente paso: validación independiente de ambas features; después, sonda e integración de sesiones reales de Codex.

### Sesión 039 — entorno de la vista frontal

- Fecha: 2026-10-20
- Petición del autor: que la vista frontal de un edificio tenga más vida detrás y a los lados; antes solo se veía el edificio sobre cielo liso.
- Hecho: `packages/web/src/tower/scenery.ts` (decorado determinista) y dibujo en `TowerView`: sol, nubes móviles, skyline lejano con ventanas, árboles, farolas y bancos fuera de los edificios, peatones y coches. Todo se mueve solo con «Vida: sí».
- Verificación: typecheck, 3 tests nuevos en `packages/web/test/scenery.test.ts` y comprobación en el navegador con `?demo=6&projects=2` (nubes y peatones avanzan, consola sin errores). DESIGN.md y pruebas manuales (§14.9) actualizados.
- Ajuste: la vista frontal descuenta los 28 px de la barra inferior, así la calzada y los coches quedan visibles (comprobado en el navegador).

### Sesión 040 — abrir la sesión desde su piso

- Fecha: 2026-10-20
- Petición del autor: que un detalle en la vista frontal abra directamente la sesión de Claude. Como no hay deep link utilizable para la app de escritorio (ver `docs/risks-and-open-questions.md`), eligió abrirla en Terminal con `claude --resume`.
- Hecho: botón ▶ en cada piso con sesión (`OPEN_BUTTON`, `openButtonAt`); `POST /sessions/:id/open` en el colector (`openSession.ts`) que exige un Origin local explícito, una sesión conocida con carpeta y un id UUID, y lanza `osascript` con `execFile` (sin shell). El resto del piso sigue abriendo el panel.
- Verificación: 4 tests nuevos (orden citada, escape para AppleScript, 403/404/422 y apertura con un opener falso); AppleScript generado compilado con `osacompile`; botón y aviso de demo comprobados en el navegador; `./init.sh` en verde con 167/167 tests.
- Pendiente: probar con el colector reiniciado y una sesión real (el colector que estaba corriendo era anterior al cambio). Si la sesión sigue viva en la app de escritorio, la terminal abre una segunda vista de la misma conversación.
- Ajuste visual: letras dentadas en Retina y con zoom. Las únicas texturas son textos, así que pasan a escalado `linear` y el lienzo a resolución `max(2, devicePixelRatio)` con `autoDensity`; los gráficos siguen pixelados (`antialias: false`). Comprobado en fachada (zoom 1 y 1,5), mapa y clic en ▶; 167/167 tests.

### Sesión 041 — edificios por actividad reciente

- Fecha: 2026-10-20
- Petición del autor: los edificios quedaban desordenados; ordenarlos del más reciente al más antiguo trabajado.
- Hecho: `recencySlots` y `lastActivity` en `world/model.ts`; el mapa usa ese orden en vez de los solares fijos guardados (el registro se sigue guardando por compatibilidad). Sustituye la regla anterior de «los solares ocupados nunca se reordenan»: ahora un edificio se mueve cuando otro tiene actividad más reciente.
- Verificación: test nuevo de orden por barrio; `./init.sh` en verde, 168/168. Con datos reales, los 10 edificios Claude aparecen en el mismo orden que la última actividad de `/sessions`. DESIGN, modelo de dominio y pruebas manuales actualizados.

### Sesión 042 — ▶ abre la sesión en la app de escritorio

- Fecha: 2026-10-20
- Petición del autor: abrir la sesión en la app de escritorio en vez de Terminal. Autorizó leer solo `sessionId` y `cliSessionId` de los archivos de sesión de la app (revisa la exclusión de la spec `open-session-link`).
- Investigación: `~/Library/Application Support/Claude/claude-code-sessions/<cuenta>/<org>/local_<id>.json` enlaza `cliSessionId` (id del transcript) con `sessionId` (`local_…`). 19 de 20 sesiones reales lo tenían.
- Hecho: `findDesktopSession`, `desktopUrl` y `createOpener` en `openSession.ts`. ▶ abre `claude://code/continue?session=local_…` con `open` (sin shell) y, si no hay correspondencia o falla, Terminal con `claude --resume`. `POST /open` devuelve `openedIn` y el front avisa «abierta en la app de Claude» o «en Terminal».
- Verificación: 3 tests nuevos (búsqueda con archivos rotos e ids no válidos, preferencia por la app y respaldo); `./init.sh` en verde, 170/170. Colector del servicio reiniciado; `POST /open` con esta sesión real devuelve `openedIn: "desktop"`.
- Confirmado por el autor: ▶ salta correctamente a otra sesión de la app de escritorio.

### Sesión 043 — proyectos de Codex en la ciudad

- Fecha: 2026-10-21
- Petición del autor: ver los proyectos de Codex igual que los de Claude.
- Decisión: en vez de esperar a los hooks (`codex-event-probe`), el colector lee los rollouts de `~/.codex/sessions` (`session_meta` → carpeta, `thread_settings_applied`/`turn_context` → modelo, `token_count` → tokens, `task_started`/`task_complete` → estado) y los títulos de `session_index.jsonl`. Nunca guarda el texto de los mensajes.
- Hecho: `collector/src/codex.ts`; `createCodexPoller` en `server.ts` (cada 3 s, solo relee archivos cambiados, ventana de 7 días con `CIUDAD_CODEX_DAYS`); `store.upsertCodex`/`pruneCodex`; pisos locales separados por proveedor; ▶ abre `codex resume <id>` en Terminal.
- Verificación: `./init.sh` 177/177; con datos reales, 12 sesiones Codex en 10 edificios del barrio Codex, puentes automáticos con FrontAgentico y cerebro-master, fachada correcta.
- Pendiente: estado rojo de Codex (requiere hooks); precios de modelos OpenAI; validación independiente de `codex-sessions`.

### Sesión 044 — ▶ de Codex abre la app de escritorio

- Fecha: 2026-10-21
- Petición del autor: abrir las sesiones de Codex en la app de escritorio en vez de Terminal.
- Investigación: la app (`/Applications/ChatGPT.app`, `com.openai.codex`) registra el esquema `codex` y acepta `codex://threads/<id>`; el id es el del rollout.
- Hecho: `codexDesktopUrl` y rama Codex en `createOpener` (respaldo: Terminal con `codex resume`); el front avisa «abierta en la app de Codex».
- Verificación: `./init.sh` 178/178; colector reiniciado y `POST /open` del hilo real «Resumir el proyecto» devuelve `openedIn: "desktop"`. Confirmado por el autor: la app de Codex abre el hilo correcto.

### Sesión 045 — Claude carga 2 días al arrancar

- Fecha: 2026-10-21
- Petición del autor: faltaban proyectos de Claude con actividad de hace 1–2 días; ampliar la ventana a 2 días.
- Hecho: `coldStart` acepta la ventana; `claudeDaysFromEnv` (`CIUDAD_CLAUDE_DAYS`, 2 por defecto). Codex sigue en 7 días.
- Verificación: `./init.sh` 179/179; colector reiniciado: 12 proyectos Claude (antes 8), entre ellos PriceMaP, portafolio-agente y agent-predictor-sports.

### Sesión 046 — banderas de estado en el mapa

- Fecha: 2026-10-21
- Petición del autor: un indicador más detallado para saber qué sesiones trabajan, cuáles terminaron y cuáles requieren aprobación.
- Hecho: `stateFlags` en `world/WorldUI.ts`; el rótulo de cada edificio pinta una bandera por estado con su número (rojo parpadeante, verde, amarillo, gris) y la leyenda `#map-legend` en `index.html`. DESIGN y pruebas manuales actualizados.
- Verificación: test nuevo `web/test/roof-flags.test.ts`; `./init.sh` 180/180; comprobado en el navegador con `?demo=24&projects=4` (banderas y leyenda visibles; la leyenda se oculta en la fachada).

### Sesión 047 — señal de humo y aviso al responder

- Fecha: 2026-10-21
- Petición del autor: no le llegaban avisos; quiere saber qué sesiones vivas ya respondieron.
- Diagnóstico: el navegador tenía los avisos de la página bloqueados («Avisos bloqueados»), y además solo se avisaba de lo urgente en rojo tras 1 min, nunca al terminar.
- Hecho: `decideFinished` y `finishedContent` en `urgent/notify.ts`; `main.ts` avisa (barra inferior + notificación) cuando una sesión pasa de trabajando/te necesita a para revisar; humo animado en los rótulos (`.roof-smoke`) de edificios con sesiones finalizadas; el botón bloqueado explica cómo desbloquear.
- Verificación: `web/test/finished.test.ts` (3 tests); `./init.sh` 183/183; humo comprobado en el navegador con la demo. El aviso real al terminar una sesión queda por confirmar por el autor.

### Sesión 048 — un solo piso «en venta» en la fachada

- Fecha: 2026-10-21
- Petición del autor: en FrontAgentico salían dos «EN VENTA», uno en medio.
- Causa: la fachada respetaba el `projectFloor` del colector y dejaba huecos al retirarse una sesión (regla anterior «la baja deja un piso libre»).
- Hecho: `tower/city.ts` compacta los pisos en ese orden; test de `city.test.ts` reescrito a la nueva regla (incluye un hueco 0/3 → contiguo). DESIGN y ARCHITECTURE actualizados.
- Verificación: `./init.sh` 183/183; fachada real de FrontAgentico con 6 sesiones contiguas y un único «EN VENTA» arriba.

### Sesión 049 — clic fuera del edificio vuelve al mapa

- Fecha: 2026-10-21
- Petición del autor: en la vista frontal, un clic fuera del edificio debe ir directamente a la vista superior.
- Hecho: `onBuilding` en `panel/model.ts` (fachada, placa, azotea y lateral de 28 px); `main.ts` llama a `backToMap()` si el clic sin arrastre cae fuera.
- Verificación: `web/test/on-building.test.ts`; `./init.sh` 184/184; en el navegador, clic en el lateral se queda en la fachada y clic en el cielo vuelve al mapa.

### Sesión 052 — pisos por actividad reciente

- Fecha: 2026-10-21
- Petición del autor: en cada edificio, las sesiones de la más reciente (arriba) a la más antigua (abajo). Antes se intentó y se descartó un rediseño de los puentes (colores y luego acento morado); no quedó nada en el código.
- Hecho: `tower/city.ts` ordena los pisos por `lastEventAt` (antigua abajo, reciente arriba), sin huecos. DESIGN, ARCHITECTURE y pruebas manuales actualizados.
- Verificación: test nuevo en `city.test.ts`; `./init.sh` 185/185; fachada real de FrontAgentico en el mismo orden que `/sessions` por `lastEventAt`.

### Sesión 053 — sesión nueva y eliminar desde la fachada

- Fecha: 2026-10-21
- Petición del autor: pulsar el piso «en venta» para crear una sesión nueva en ese proyecto y deslizar a la derecha para eliminar una sesión (sin tocar el proyecto). Eligió abrirla en la app de escritorio.
- Investigación: la app de Claude acepta `claude://code/new?folder=<carpeta>` (servicio «New Claude Code Session Here» del Finder); la de Codex, `codex://threads/new?path=<carpeta>`.
- Decisión: «eliminar» manda el transcript a `~/.Trash` (recuperable) en vez de borrarlo, con confirmación; no se eliminan sesiones activas.
- Hecho: `newSessionUrl`/`createStarter` en `openSession.ts`, `trash.ts`, rutas `POST /sessions/:id/new|delete` y `store.remove` en el colector; `forSaleAt`, `isSwipe`, `SWIPE_DELETE` en `panel/model.ts`, `TowerView.slide` y gestos en `main.ts`.
- Verificación: `collector/test/new-delete.test.ts` (5) y `web/test/floor-actions.test.ts` (2); `./init.sh` 192/192. En el navegador (demo): clic en «EN VENTA» avisa; deslizar pide confirmación y retira el piso; deslizar una roja se rechaza; deslizar corto no hace nada. Colector reiniciado: `/new` y `/delete` responden 403 sin Origin y 404 con id inexistente. Confirmado por el autor con sesiones reales: funciona.

### Sesión 054 — límites de uso: depósito y central

- Fecha: 2026-10-21
- Petición del autor: ver cuánto queda del límite de Claude y de Codex y cuándo se recarga, con un elemento distinto en cada barrio. Antes, ajuste del rótulo del barrio (título y recuento en una línea, sin invadir solares).
- Investigación: los rollouts de Codex traen `rate_limits`; Claude Code 2.1.304 solo lo da a la statusline (`rate_limits.five_hour|seven_day`), confirmado en la documentación incluida en su binario.
- Hecho: `collector/src/usage.ts`, lectura en `codex.ts`, `POST /usage/claude`, mensaje WS `usage` y `snapshot.usage`, `hook/statusline.sh` e instalación en `hooks.ts` sin pisar otra statusline; en el front `world/usage.ts`, `MapView.setUsage` (depósito y embalse; central, batería y pilas; goteo, vapor y media luz), rótulos en `WorldUI` y demo. El subtítulo del barrio se encoge para dejar sitio al rótulo.
- Verificación: `./init.sh` 212/212 en 35 archivos (nuevos: `collector/test/usage.test.ts` 9, `web/test/usage.test.ts` 6, statusline 3, `stateClient` 2). Navegador demo: ambos elementos, textos accesibles, Vida no y consola sin errores. Colector real reiniciado: Codex «5 h: recargado · semana: quedan 70 %», igual que el rollout del 19-10; Claude «sin dato» (statusline aún no instalada).
- Statusline instalada (`npm run hooks:install`). Con una sesión real de Claude Code en terminal, el depósito marca «quedan 36 %, recarga 15:20», igual que la barra de Claude Code (64 % usado, reinicia en 3h05m). Desde esta sesión de la app de escritorio no llegó ningún dato; el primero vino de la sesión en terminal (por comprobar si la app de escritorio ejecuta la statusline).
- Pendiente: validación independiente.

### Sesión 055 — análisis de referentes y endurecimiento

- Fecha: 2026-10-22
- Petición del autor: orquestar subagentes para comparar la Ciudad con lo visto en LinkedIn (Pixel Agents y similares), crear una skill evaluadora y aplicar los ajustes que salieran, hasta llegar al 98 % del límite de la sesión.
- Análisis: informes en `docs/analisis/` (`investigacion-referentes.md`, `fichas-referentes.md`, `brechas.md`). Skill nueva `.claude/skills/evaluar-implementacion-agentes/`. De los 8 referentes de LinkedIn solo se confirmó Pixel Agents; Habblaud, Flightdeck y el resto necesitan el enlace o el texto del post.
- Arreglo previo: `./init.sh` fallaba (`pico is not a function`, `node_modules/picomatch` corrupto). Resuelto con `npm ci`.
- Hecho (feature `hardening-and-alerts`): `/hook` y `/usage/claude` rechazan Origin y exigen JSON; `isAllowedOrigin` limitado a los puertos 5173, el del colector y `CIUDAD_WEB_PORTS`; `data/events` solo con metadatos (`CIUDAD_EVENTS_FULL=1` para sondear) y retención de 7 días (`CIUDAD_EVENTS_DAYS`); `hooks:install` funciona sin `settings.json` y explica cómo convivir con otra statusline; un rojo sin eventos en 48 h se duerme; botón «Sonido» con campanilla (Web Audio) en rojo y al responder. Docs desactualizados corregidos (Codex «pendiente», orden de solares, «Sí, continúa», bloque acumulado, avioneta).
- Verificación: `./init.sh` 219/219. Navegador demo: botón Sonido y persistencia, consola limpia. Colector real reiniciado: curl de `docs/pruebas-manuales.md` §23 con los códigos esperados.
- Además: tokens y coste de cada sesión de Claude suman sus subagentes (`TranscriptReader.readSession`, `mergeSubagents`). Verificado en el colector real con esta sesión. Barra superior sin redibujos innecesarios. Borrador de `README.md`. `isAllowedOrigin` usa `COLLECTOR_PORT` (el colector) además de `CIUDAD_PORT` (los hooks): ojo, son dos variables para el mismo puerto. Rollouts de Codex leídos de forma incremental (`createRolloutParser`); mismas 11 sesiones antes y después.
- Sin commit.

#### Pendiente según docs/analisis/brechas.md

1. Decisión del autor: el total de tokens de la barra incluye la caché leída (lo fija la spec aceptada `status-bar-counters`). ¿Separarla o mostrar «sin caché»?
2. ~~Subagentes~~: tokens y coste sumados (sesión 055); ayudantes en el piso y cuenta en el panel (sesión 057, feature `subagent-helpers`).
3. Codex completo: `codex-event-probe` (hooks y estado rojo), coste (falta tabla de precios oficial de modelos OpenAI; no inventarla), separar lecturas/web/ediciones (en los rollouts locales las herramientas son genéricas, `exec` y `js`, así que no se puede sin mirar sus argumentos; lectura incremental del rollout: hecha en esta sesión). Esfuerzo M-L.
4. ~~Rendimiento~~: redibujos agrupados y fachada incremental (sesión 057).
5. ~~Estado de error e indicador de contexto~~: hecho en la sesión 057 (feature `floor-failure-context`).
6. `open-source-release`: README (borrador hecho en esta sesión, revisar), elegir LICENSE, `engines`, limpiar datos personales de docs y capturas, decidir el historial git, aislar lo que es solo macOS (`/open`, Papelera, launchctl), instalación en un comando (`npx`).
7. Validación independiente de `project-buildings`, `codex-sessions`, `city-neighborhood-map`, `usage-limits` y `hardening-and-alerts`; y de las 7 entradas registradas a posteriori en `feature_list.json` en esta sesión (facade-scenery, open-session-desktop, recency-order, claude-cold-start-days, roof-flags-smoke, click-outside-back, new-and-delete-session).
8. ~~Skill evaluadora~~: aplicada la versión que corrige los 10 fallos (2026-10-23, pasando por `crear-skill-o-agente`).

#### Incidencia iCloud (2026-10-23)

- `~/Documents` está en iCloud Drive con «Optimizar almacenamiento». Con la sincronización bloqueada, 14 archivos del repo (entre ellos `feature_list.json`) y partes de `node_modules` y `.git` se leían con 0 bytes; por eso fallaba `./init.sh` (`picomatch`). El autor reactivó iCloud Drive y todo volvió a leerse entero; `git fsck` sin errores.
- `node_modules` ahora es un enlace a `node_modules.nosync` (iCloud ignora `.nosync`); excluido en `vitest.config.ts` y `.gitignore`; Vite necesita `resolve.preserveSymlinks: true` (`packages/web/vite.config.ts`) o deja sin convertir los módulos CommonJS y la ciudad sale vacía. Tras un `npm ci`, repetir: `mv node_modules node_modules.nosync && ln -s node_modules.nosync node_modules`.
- Recomendado: mover el proyecto fuera de `~/Documents`.

### Sesión 056

- Fecha: 2026-10-23
- Objetivo: implementar `codex-event-probe` según `docs/specs/codex-event-probe.md`.
- Hecho: `send.sh codex` → `POST /hook?agent=codex` (otro agente → 400); cada línea del log guarda `agent`; los eventos de Codex solo se registran (no tocan el store ni el WebSocket); instalador `npm run hooks:install:codex|uninstall:codex` sobre `~/.codex/hooks.json` (`CODEX_HOOKS_PATH`), con los 12 eventos de Codex; si al desinstalar queda vacío, borra el archivo. `turn_id`, `model` y `trigger` se guardan como metadatos.
- Verificación: `./init.sh` 227/227 (nuevo `codex-hooks.test.ts`). Colector real reiniciado (`launchctl kickstart`): `send.sh codex` deja `{agent:"codex"}` en el log y no aparece en `/sessions`; con el colector apagado sale en 0,01 s con exit 0. Hooks instalados de verdad en `~/.codex/hooks.json` (archivo nuevo).
- Bloqueo: Codex no ejecuta hooks sin aprobarlos (`trusted_hash` en `config.toml`, pantalla de revisión de la TUI). `codex exec` los ignoró sin avisar. Falta que el autor abra `codex` interactivo, apruebe los hooks y haga una sesión real (lectura + permiso); después, documentar el orden y los campos reales en `docs/technical-discovery.md` y pasar la feature a `passing`.
- Sin commit.
- Revisión posterior (2026-10-23): El autor dijo haber aprobado los hooks y hecho una sesión real, pero el log no tiene eventos `codex` (solo la sonda manual), `config.toml` no tiene `trusted_hash` y no hay rollouts nuevos tras las pruebas de las 19:28. Por decisión del autor, `codex-event-probe` queda **pendiente** y se pasa a lo que haga destacar la Ciudad para publicarla en LinkedIn (`docs/analisis/brechas.md`).

### Sesión 057

- Fecha: 2026-10-24
- Objetivo: punto 2 de las brechas, representar y contar los subagentes (feature nueva `subagent-helpers`).
- Hecho: `Session.subagentsActive` (hooks con `agent_id`; `SubagentStop` lo cierra; al dormirse vuelve a 0) y `subagentsTotal` (transcripts en `<id>/subagents/`). En el piso, un ayudante pequeño con camiseta de acento por subagente trabajando (hasta 3 y «+N»); en el panel, fila «Subagentes». La demo da subagentes a los pisos de Claude.
- Verificación: `./init.sh` 230/230. Navegador `?demo=12`: ayudantes y «3 trabajando · 5 en total», consola limpia. Colector real reiniciado: 5 sesiones con total; eventos de prueba en `prueba-subagentes` dan 2 → 1 activos y `SessionEnd` la retira.
- Pendiente: ver los ayudantes con subagentes reales lanzados desde Claude (`docs/pruebas-manuales.md` §25, paso 3). Codex no informa de subagentes. Validación independiente.
- Sin commit.
- Después (mismo día): punto 5, feature `floor-failure-context`. Avería desde los errores de la API del transcript (`isApiErrorMessage`, `error`), solo de la conversación principal, sin guardar su texto; no es un estado nuevo, es una marca con cartel naranja. Contexto desde la statusline (`context_window.used_percentage` + `session_id`, comprobado en el binario de Claude Code 2.1.309) con `store.setContext`. Barra bajo la placa: ámbar ≥ 70 %, naranja con «!» ≥ 85 %. Filas «Contexto» y «Avería» en el panel.
- Verificación: `./init.sh` 237/237. Navegador demo: avería y barras legibles en todos los estados, panel correcto, consola limpia.
- Límite encontrado: la app de escritorio de Claude no ejecuta la statusline (última llegada el 2026-10-21; `data/usage.json`). Con datos reales, la barra de contexto solo sale en sesiones de `claude` en Terminal. Alternativa pendiente de decisión: calcularlo del transcript (último uso de entrada / tamaño de ventana), pero el tamaño por modelo (200k o 1M) no está en el transcript y no se debe suponer.
- Commits: `0c453c2` (sesiones 056-057) y `e39c574` (avería y contexto).
- Puentes: El autor pidió algo más creativo y fácil de identificar. Se probó un puente colgante dorado y lo rechazó porque mareaba; luego se le propusieron líneas al pasar el ratón, vecinos de manzana y foco al seleccionar, y también los rechazó. Elegido: banderines del mismo color en las azoteas de los edificios relacionados (`pennantColors` en `world/model.ts`), sin líneas. Verificado en el navegador demo; `./init.sh` 238/238. Commit `3f55d63`.
- Señales de azotea (petición del autor): el humo ahora indica «trabajando»; «para revisar» tiene un cartel amarillo ✓ que flota (`roof-ready` en `index.html`, `has-ready` en `WorldUI.ts`). Leyenda y aviso de la barra («✓ … ya respondió») actualizados. Verificado en el navegador demo.
- Rebobinar (feature `city-replay`): `GET /history` reconstruye un día de Claude desde `data/events` con el mismo `reduce` (fotogramas de 5 min con el estado más urgente del intervalo, para no perder turnos cortos); modo «Rebobinar» en el front con deslizador y reproducción. Verificado con el día real 2026-10-23 y en el navegador. Límites: sin Codex ni métricas del pasado.
- Evaluación de rendimiento del front (solo medida, sin cambios de código). Redibujo completo (`render()`): real 44 sesiones 0,9 ms (61 fps, 31 MB); demo 500 sesiones en mapa 3,5 ms y 7,6 ms reconstruyendo el mapa; fachada de 12 pisos 1,2 ms; fachada de 250 pisos 34 ms (más de un fotograma). Picos reales de 11 eventos/s (≈60/min), y cada mensaje del WebSocket redibuja. Puntos calientes: `TowerView.update` destruye y recrea todo en cada redibujo; `render()` se llama una vez por mensaje sin agrupar por fotograma. Memoria: con el panel del navegador oculto el heap crece ~3 MB por redibujo de la fachada grande y no baja; no se pudo confirmar con fotogramas reales (Pixi libera recursos al pintar). Probado `destroy({ context: true })` sin efecto en esa condición; revertido.
- Mejoras de rendimiento aplicadas: (1) `scheduleRender` en `main.ts` agrupa los mensajes del colector y dibuja como mucho una vez cada 50 ms (temporizador, no requestAnimationFrame, para que los avisos sigan con la pestaña oculta); (2) `TowerView` separa decorado (solo se rehace si cambia la geometría) y pisos en caché por su dibujo (solo se rehacen los que cambian; los sobrantes se destruyen con `context: true`). Medido de nuevo: fachada de 250 pisos 34 ms → 1,1 ms sin cambios y 2,2 ms con un piso cambiando; entrar al edificio 51 → 20 ms; memoria estable (78 → 74 MB tras 200 redibujos, antes 64 → 608 MB). Ciudad real (19 edificios): 1,7 ms y 27 MB. `./init.sh` 245/245; revisado a la vista: estados, revisar un piso y deslizar para eliminar.
- `open-source-release` en curso (petición del autor, con otros sistemas como último paso): datos personales sustituidos por «el autor» y «<carpeta del repo>»; LICENSE MIT (Jonathan Paez) y engines; README al día; clon limpio probado de punta a punta en una carpeta temporal; soporte de Linux y Windows para abrir sesiones (`openUrlArgs`, `terminalLaunchers`, `winResumeCommand`), papelera (freedesktop y Papelera de reciclaje), hooks en Node (`send.mjs`, `statusline.mjs`) y arranque automático (`scripts/autostart.mjs`: launchd, systemd o carpeta Inicio). Sin Docker ni máquinas Linux/Windows: verificado solo con tests que simulan cada sistema. `./init.sh` 253/253. Pendiente: pruebas reales en Linux/Windows, historial de git, fusión de la rama y repo público (con visto bueno).
- Publicación: repo público nuevo `jfpazto/agent-city` con un solo commit inicial (autor Jonathan Paez, correo noreply de GitHub), sin el historial de este repo privado.
