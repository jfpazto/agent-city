# Feature Implementation Spec: Límites de uso de Claude y Codex (depósito de agua y central eléctrica)

## Source Feature

- `id`: usage-limits
- `area`: full-stack
- `depends_on`: city-neighborhood-map, codex-sessions (ambas `passing`, aún sin validación independiente)
- `status`: not_started
- `source`: `feature_list.json`

## Goal

Que cada barrio muestre de un vistazo cuánto queda del límite de uso de su proveedor y cuándo se recarga, con dos ventanas: la de 5 h y la semanal. En el barrio Claude es un **depósito de agua** (5 h) con un **embalse** pequeño (semanal). En el barrio Codex es una **central eléctrica** con **batería** (5 h) y una **fila de pilas** (semanal). El nivel siempre representa lo que **queda** (100 − usado). Un rótulo muestra porcentaje y hora de recarga.

El dato tiene que ser honesto: si es antiguo o ya pasó la hora de recarga, no se enseña la cifra caducada.

## Non-Goals

- No se estima el consumo a partir de tokens ni de costes: solo se muestran los porcentajes que da el proveedor.
- No se consultan APIs remotas de Anthropic ni de OpenAI; todo se lee en local.
- No hay alertas, notificaciones ni sonidos por límite bajo (posible feature aparte).
- No se gestionan créditos de pago extra (`credits` de Codex se ignora).
- No se cambia la recogida de sesiones de Codex ni de Claude.

## Job Story

Cuando estoy trabajando con varios agentes a la vez,
quiero ver en la ciudad cuánto me queda de límite en Claude y en Codex y cuándo se recarga,
para decidir a qué proveedor le paso el siguiente trabajo sin quedarme a mitad.

## Users And Permissions

- Usuario local (único): ve los indicadores. No hay roles. El colector solo escucha en `127.0.0.1`; ningún dato sale de la máquina.

## Acceptance Scenarios

### Scenario 1: Codex con dato reciente
Given un rollout de `~/.codex/sessions` cuyo último `token_count` trae `rate_limits.primary {used_percent: 94, window_minutes: 300, resets_at}` y `secondary {used_percent: 30, window_minutes: 10080, resets_at}`
When el colector relee los rollouts (ciclo de 3 s)
Then el front muestra la batería al 6 %, las pilas al 70 % y la hora local de cada recarga.

### Scenario 2: Claude con dato de statusline
Given la statusline instalada y Claude Code enviando límites en su JSON de entrada
When Claude Code refresca la statusline
Then el colector guarda el último dato de Claude y el depósito y el embalse muestran lo que queda y su recarga.

### Scenario 3: Hora de recarga pasada
Given un dato con `resets_at` anterior a ahora
When se pinta el barrio
Then esa ventana se muestra llena con el rótulo «recargado», sin la cifra anterior.

### Scenario 4: Sin dato o dato antiguo
Given que no hay dato de un proveedor, o que tiene más de 6 h (5 h) o más de 7 días (semanal) y no ha pasado `resets_at`
When se pinta el barrio
Then el elemento se ve en gris con «sin dato reciente» (o «sin dato»), sin porcentaje.

### Scenario 5: Vida desactivada
Given `Vida: no` o `prefers-reduced-motion`
When el depósito está por debajo del 10 % o la batería agotada
Then no hay goteo, vapor ni parpadeo, pero el nivel, el porcentaje y la hora siguen visibles.

## Repository Research

### Files Inspected

- `ARCHITECTURE.md`: flujo hook → `send.sh` → `POST /hook`; WS `snapshot/session/removed`; Codex leído cada 3 s en `collector/src/codex.ts`.
- `packages/collector/src/codex.ts`: `parseRollout` ya recorre los eventos `token_count` (línea ~76); ahí se añade la lectura de `rate_limits`.
- `packages/shared/src/index.ts`: `ServerMessage` (línea 50), donde va el nuevo mensaje.
- `packages/collector/hook/send.sh` y `packages/collector/scripts/hooks.ts`: patrón de instalación que conserva la configuración ajena y deja copia `.bak-*`, y de envío con curl, timeout de 1 s y salida 0.
- `packages/web/src/world/MapView.ts`: geometría por barrio (`d.x`, `d.y`, franja de rótulo de 64 px), `setZoom`, `tick(ms, animated)` y el patrón de sprites animados (`beacons`, `travelers`).
- `~/.codex/sessions/2026/10/19/rollout-…jsonl` (real, 2026-10-21): contiene `rate_limits` con `primary`, `secondary`, `used_percent`, `window_minutes` y `resets_at` (epoch en segundos).
- Binario de Claude Code 2.1.304: contiene las cadenas `five_hour`, `seven_day` y `resets_at`. **No está verificado** que lleguen al JSON de la statusline ni con qué nombres exactos.

### Existing Patterns To Follow

- Funciones puras de parseo con tests y fixtures anonimizados en `packages/*/test`.
- Entradas al colector solo desde `127.0.0.1`; los POST exigen un Origin local o ninguno.
- Geometría estática en Pixi, más sprites separados para lo animado, controlados por `tick(ms, animated)`.
- Textos accesibles en HTML desde `WorldUI.ts` con `textContent`.

### Current Gaps

- No existe statusline de usuario (`~/.claude/settings.json` no tiene `statusLine`).
- El protocolo WS no lleva estado global, solo sesiones.
- Formato exacto de los límites en la statusline de Claude Code: sin confirmar (Tarea 1).

## Technical Approach

1. **Modelo compartido** (`shared`):
   - `UsageWindow = { usedPercent: number; resetsAt: string /* ISO */; windowMinutes: number }`.
   - `UsageLimits = { provider: "claude"|"codex"; fiveHour?: UsageWindow; weekly?: UsageWindow; observedAt: string }`.
   - Mensaje nuevo `{type:"usage", limits: UsageLimits}`. El `snapshot` incluye `usage?: UsageLimits[]` para que el primer mensaje siga siendo autosuficiente.
2. **Codex**: en `parseRollout`, guardar el último `rate_limits` válido junto a la marca de tiempo del evento. Asignación de ventanas: `primary` es 5 h si `window_minutes === 300` y `secondary` es semanal si `window_minutes === 10080`. Cualquier otro valor se ignora. El colector se queda con el dato más reciente de todos los rollouts y, si cambia, lo emite.
3. **Claude**:
   - Script `packages/collector/hook/statusline.sh`: lee el JSON de stdin, lo reenvía con curl (`--max-time 1`) a `POST /usage/claude`, imprime una línea corta (p. ej. el modelo) y sale siempre con 0.
   - Solo se envía el bloque de límites, nunca el prompt ni el transcript: el filtrado lo hace el colector, que descarta todo lo demás antes de guardar o emitir.
   - `hooks.ts install` añade `statusLine` solo si el usuario no tiene ya uno; si lo tiene, lo avisa y no lo pisa. `uninstall` lo quita solo si es el nuestro.
4. **Persistencia**: último dato por proveedor en `data/usage.json` (ignorado por git), para tenerlo tras reiniciar el colector.
5. **Estado derivado** (función pura en `web/src/world/usage.ts`): `usageView(limits, now)` devuelve por ventana `{ remaining, label, state: "ok"|"bajo"|"agotado"|"recargado"|"sin_dato" }`. Umbrales: bajo < 20 % y agotado ≤ 0 %. Se considera antiguo con más de 6 h (5 h) o más de 7 días (semanal).
6. **Visual** (`web/src/world/UsageView.ts`):
   - Ambos elementos se colocan en la franja de rótulo, a la derecha del título y sin invadir los solares. Comprobar a zoom de ciudad y de barrio, como en el ajuste de rótulo del 2026-10-21.
   - Claude: torre con depósito de nivel de agua, más embalse bajo.
   - Codex: nave con chimenea y batería vertical, más 4 pilas.
   - Animaciones solo con `animated`: goteo bajo el 10 %, vapor proporcional al uso y farolas del barrio a media luz si está agotado.
   - Rótulo HTML accesible en `WorldUI.ts`, p. ej. «Claude: quedan 32 % (5 h, recarga 18:40) · 70 % semanal».

## Expected File Changes

- `packages/shared/src/index.ts`: modificar; tipos `UsageWindow`, `UsageLimits` y mensaje `usage`.
- `packages/collector/src/codex.ts`: modificar; extraer `rate_limits`.
- `packages/collector/src/usage.ts`: crear; store, validación, persistencia y normalización.
- `packages/collector/src/server.ts`: modificar; `POST /usage/claude` (Origin local o ninguno, cuerpo máx. 64 KB) y emisión WS.
- `packages/collector/hook/statusline.sh`: crear.
- `packages/collector/scripts/hooks.ts`: modificar; instalar y desinstalar `statusLine`.
- `packages/web/src/stateClient.ts`: modificar; manejar `usage`.
- `packages/web/src/world/usage.ts` y `UsageView.ts`: crear.
- `packages/web/src/world/MapView.ts`, `WorldUI.ts` y `main.ts`: modificar; integración y demo (`?demo=` con límites ficticios).
- Tests: `packages/collector/test/usage.test.ts`, ampliar `codex` y servidor, y `packages/web/test/usage.test.ts`.
- `.gitignore`: verificar que `data/` ya está ignorado.

## Visual Design Impact

- UI involved: sí.
- Design source: `DESIGN.md`, paleta cálida (Claude) y fría (Codex) ya usada en `MapView.ts`.
- States: ok, bajo, agotado, recargado, sin dato, Vida no; zoom lejano y cercano.
- New design artifact required: captura de evidencia en `docs/design/evidence/usage-limits.png`.

## Durable Documentation Impact

- `ARCHITECTURE.md`: actualizar; mensaje `usage`, `POST /usage/claude`, statusline y `data/usage.json`.
- `docs/technical-discovery.md`: actualizar; fuente de los límites por proveedor y su verificación.
- `docs/pruebas-manuales.md`: actualizar; pasos para ver ambos elementos y estados, con fecha.
- `CONTEXT.md`: actualizar; términos «límite de uso», «ventana» y «recarga».
- `AGENTS.md`: no hace falta; las reglas no cambian.

## Implementation Tasks

1. **Verificar la fuente de Claude**: instalar temporalmente una statusline que vuelque stdin a un archivo en el scratchpad. Anotar en `docs/technical-discovery.md` los nombres reales de los campos. Si no hay límites, implementar solo Codex y dejar Claude en «sin dato», anotándolo como bloqueo en `PROGRESS.md`.
2. Tipos en `shared` y función pura de normalización, con tests.
3. Lectura de Codex en `parseRollout`, con un fixture anonimizado que incluya `rate_limits`.
4. Store del colector, persistencia, endpoint y emisión WS, con tests de servidor (403 con Origin ajeno y cuerpo inválido descartado).
5. `statusline.sh` e instalación y desinstalación en `hooks.ts`, sin pisar una statusline ajena.
6. `usageView` en el front, con tests de estados y umbrales.
7. `UsageView.ts`, integración en el mapa, rótulo accesible y demo.
8. Documentos y evidencia; `./init.sh` en verde.

## Verification Plan

- `./init.sh` (typecheck y todos los tests).
- Tests nuevos: parseo de `rate_limits` (5 h, semanal, ventanas desconocidas, valores fuera de 0–100); estados por tiempo (antiguo, recargado); endpoint (Origin, tamaño, campos ajenos descartados).
- Manual con colector real: comparar el porcentaje mostrado en Codex con el último `rate_limits` del rollout más reciente.
- Manual con Claude: tras la tarea 1, comparar con lo que muestra Claude Code (`/usage`).
- Navegador: `?demo=` con los 5 estados; Vida sí/no; zoom de ciudad y de barrio sin solaparse con los solares; consola sin errores.
- `npm run hooks:install` y `hooks:uninstall` sobre una copia de settings con y sin statusline previa.

## Evidence To Capture

- Salida de `./init.sh` con el recuento de tests.
- Captura de ambos barrios con datos reales y otra de la demo con los estados.
- Nota con el formato real de la statusline de Claude Code (versión incluida).

## Validator Checklist

- [ ] El nivel representa lo que queda, no lo usado, en ambos barrios.
- [ ] Ningún estado muestra una cifra caducada.
- [ ] La statusline y el envío terminan siempre con código 0 y en ≤ 1 s, aunque el colector esté apagado.
- [ ] No se guarda ni se emite nada del JSON de la statusline fuera del bloque de límites.
- [ ] Una statusline ajena no se pisa y la desinstalación la deja intacta.
- [ ] Con Vida no, no hay movimiento y la información sigue visible.
- [ ] Docs y `docs/pruebas-manuales.md` actualizados; fixtures anonimizados.

## Open Questions

- Nombres exactos de los límites en la statusline de Claude Code 2.1.304 (se resuelve en la Tarea 1).
- Si el usuario ya tiene statusline propia en el futuro, ¿hay que encadenarla en vez de avisar? Por ahora solo se avisa.
