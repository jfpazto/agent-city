# Spec de implementación: máquina de estados de sesión a partir de los eventos

## Feature de origen

- `id`: session-state-machine
- `area`: colector
- `depends_on`: hook-event-probe (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Objetivo

Que el colector sepa en todo momento en qué estado está cada sesión de Claude Code (`trabajando`, `te_necesita`, `para_revisar` o `dormida`) a partir de los eventos de hook que ya recibe, y lo exponga en `GET /sessions`. Es el núcleo de la Ciudad: los colores de los pisos, los contadores y la avioneta dependen de que este estado sea correcto.

## Fuera de alcance

- Pasar a `dormida` por tiempo (`idle-timeout`): aquí no hay reloj, solo reacciones a eventos.
- Abrir un piso para marcarlo como revisado (`review-clears-on-open`).
- WebSocket (`ws-state-stream`), front y métricas de transcript.
- Reconstruir el estado al arrancar desde los transcripts o desde el log (`cold-start-rebuild`). Al reiniciar, el estado empieza vacío.
- Persistir el estado en disco.

## Historia de trabajo

Cuando una sesión cambia de situación (trabaja, me pide permiso, termina),
quiero que el colector lo refleje al instante,
para que la torre muestre el color correcto sin que yo revise sesión por sesión.

## Usuarios y permisos

- El autor, en local. `GET /sessions` solo en 127.0.0.1 (el bind ya lo garantiza).

## Reglas de transición (contrato)

Función pura `reduce(session | undefined, event, now) → session | null`. `null` significa que la sesión se retira. La tabla sale de los eventos reales anotados en `docs/domain-model.md`.

La tabla de transiciones vigente está en `docs/domain-model.md` (sección «Estados y ciclo de vida») y coincide fila por fila con `reduce()`. Resumen de los efectos que no son de estado: `UserPromptSubmit` guarda `session_title`; `PreToolUse` guarda `lastTool` y el `tool_use_id` por herramienta; `PermissionRequest` y `Notification` guardan `lastMessage`.

Reglas comunes:
- Cualquier evento aceptado actualiza `lastEventAt = now`.
- Si llega un evento de una sesión desconocida, se crea antes de aplicarlo (título por defecto: `basename(cwd)`; si no hay `cwd`, los 8 primeros caracteres del id).
- La planta (`floor`) se asigna una vez, al crear la sesión: la planta libre más baja. Una sesión retirada libera su planta.

Forma de la sesión expuesta, en `@ciudad/shared`:
```ts
type SessionState = "trabajando" | "te_necesita" | "para_revisar" | "dormida";
type Session = {
  id: string; title: string; cwd?: string; transcriptPath?: string;
  state: SessionState; floor: number; lastEventAt: string;
  lastTool?: string; lastMessage?: string;
};
```
`pending` y `lastUseIdByTool` son internos y no se exponen.

> Cambios durante la implementación:
> 1. `pendingPermission` (booleano) pasó a ser una lista `pending` de `tool_use_id`. Motivo: en una sesión real, una herramienta en paralelo apagaba el rojo mientras el permiso seguía pendiente.
> 2. Tras la primera validación (revise), un permiso denegado se resuelve con `PostToolUseFailure` o con una llamada nueva de la misma herramienta, y se ignoran los `session_id` que no son texto. `PostToolUseFailure` se añadió al instalador de hooks.

## Escenarios de aceptación

### Escenario 1: ciclo con permiso
Dada una sesión nueva
cuando llegan `SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `PostToolUse` y `Stop`
entonces el estado pasa por `dormida`, `trabajando`, `trabajando`, `te_necesita`, `trabajando` y `para_revisar`.

### Escenario 2: aviso de permiso tardío
Dada una sesión en `trabajando` tras aprobar un permiso (`PermissionRequest` y luego `PostToolUse`)
cuando llega un `Notification` `permission_prompt`
entonces sigue en `trabajando`.

### Escenario 3: aviso de permiso sin `PermissionRequest` previo
Dada una sesión sin permisos pendientes (`pending` vacío)
cuando llega un `Notification` `permission_prompt`
entonces se queda como estaba. Se acepta como limitación: en la app de escritorio, `PermissionRequest` llega siempre antes.

### Escenario 4: aviso de inactividad tras `Stop`
Dada una sesión en `para_revisar`
cuando llega un `Notification` de otro tipo
entonces sigue en `para_revisar` y se guarda el mensaje.

### Escenario 5: fin y plantas
Dadas las sesiones A (planta 0) y B (planta 1)
cuando A recibe `SessionEnd` y luego aparece C
entonces A desaparece de `GET /sessions` y C ocupa la planta 0.

### Escenario 6: integración HTTP
Dado el colector arrancado
cuando hago `POST /hook` con una secuencia real
entonces `GET /sessions` devuelve las sesiones con el estado esperado, ordenadas por planta. El log en disco sigue funcionando como antes.

### Escenario 7: sesiones reales
Dados los hooks instalados
cuando uso una sesión real de la app de escritorio
entonces `curl 127.0.0.1:4317/sessions` muestra su paso por `trabajando`, `te_necesita` (al pedir permiso) y `para_revisar` (al terminar).

## Investigación del repositorio

### Archivos revisados
- `packages/collector/src/server.ts`: `createServer({ eventsDir })` y `handleHook`, que llama a `appendEvent`. Aquí se engancha el store.
- `packages/collector/src/eventLog.ts`: patrón de módulo pequeño.
- `packages/shared/src/index.ts`: de momento solo `HealthResponse`.
- `packages/collector/test/*.test.ts`: patrón con puerto 0, `fetch` y tmpdir.
- `docs/domain-model.md`: tabla de estados y eventos reales observados.
- `data/events/2026-10-19.jsonl` (solo estructura): tipos observados `SessionStart` (`startup`/`resume`), `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `PermissionRequest`, `Notification` (`permission_prompt`), `Stop`, `SubagentStop` y `SessionEnd` (`other`).

### Lo que falta
- No existe todavía ningún estado en memoria.
- El `notification_type` de inactividad no se ha observado; la regla de «otro tipo → sin cambio» lo cubre sin conocerlo.

## Enfoque técnico

- `packages/collector/src/sessions.ts`:
  - `reduce()` puro, según la tabla.
  - `createSessionStore()` con `apply(event, now)`, `list()` y `get(id)`. Mantiene un `Map<string, InternalSession>` y asigna plantas.
- `server.ts`:
  - `createServer({ eventsDir, store })`, que crea un store propio si no se le pasa.
  - En `handleHook`, después de `appendEvent`, llama a `store.apply(event, new Date())`. Si `apply` lanza una excepción, se registra en el log del colector y se responde 204 igualmente: el hook nunca debe fallar.
  - Nueva ruta `GET /sessions` → 200 con `Session[]` ordenado por `floor`.
- Tipos `Session` y `SessionState` en `packages/shared/src/index.ts`.
- Fixtures de test: secuencias construidas a mano con la forma de los eventos reales y valores inventados (sin prompts reales).

## Archivos previstos

- `packages/collector/src/sessions.ts`: crear.
- `packages/collector/src/server.ts`: modificar.
- `packages/shared/src/index.ts`: modificar.
- `packages/collector/test/sessions.test.ts`: crear; escenarios 1 a 5 sobre `reduce` y el store.
- `packages/collector/test/sessions-http.test.ts`: crear; escenario 6.
- `docs/domain-model.md`: actualizar la tabla (`PostToolUse` resuelve el rojo, `pendingPermission`, `SessionStart` → `dormida`).
- `feature_list.json`, `PROGRESS.md`: evidencia.

## Impacto visual

- Hay interfaz: no (solo API).

## Impacto en la documentación

- `ARCHITECTURE.md`: actualizar con una línea: el store de sesiones vive en memoria en el colector y se alimenta desde `/hook`.
- `CONSTRAINTS.md`: no hace falta.
- `AGENTS.md`: no hace falta.
- `docs/domain-model.md`: actualizar como se indica arriba. Esa tabla y `sessions.ts` deben coincidir.

## Plan de implementación

1. Tipos en `shared`.
2. `reduce` con sus tests (escenarios 1 a 4).
3. Store con plantas y sus tests (escenario 5).
4. Conexión con `/hook` y ruta `/sessions`, con el test HTTP.
5. Prueba con sesiones reales (escenario 7) y actualización de los docs.

## Tareas

- [ ] `Session` y `SessionState` en `@ciudad/shared`.
- [ ] `reduce` puro según la tabla, sin `Date.now()` dentro (recibe `now`).
- [ ] `createSessionStore` con asignación de plantas.
- [ ] `handleHook` llama a `store.apply` de forma tolerante a errores.
- [ ] `GET /sessions`.
- [ ] Tests unitarios y HTTP.
- [ ] Actualizar `domain-model.md` y `ARCHITECTURE.md`.
- [ ] Evidencia real y commit.

## Plan de verificación

- `./init.sh` → typecheck y todos los tests en verde (los 9 actuales y los nuevos).
- Reiniciar el colector persistente para cargar el código nuevo, abrir una sesión real y hacer `curl -s 127.0.0.1:4317/sessions | python3 -m json.tool` en tres momentos: trabajando, pidiendo permiso (en modo «Pedir permiso») y terminada.
- E2E: no hay harness; bastan los tests HTTP más la prueba real.

## Evidencia a guardar

- Salida de `./init.sh`.
- Los tres `curl /sessions` del escenario 7, solo con `id` abreviado, `state` y `floor`, sin títulos ni prompts.

## Checklist del validador

- [ ] `reduce` es puro y cubre todas las filas de la tabla.
- [ ] El aviso de permiso tardío no vuelve a poner el piso en rojo (escenario 2).
- [ ] `/hook` sigue respondiendo 204 aunque falle el store.
- [ ] No se añadió reloj, persistencia, WebSocket ni lectura de transcripts.
- [ ] `docs/domain-model.md` coincide con el código.
- [ ] Hay evidencia con una sesión real.
