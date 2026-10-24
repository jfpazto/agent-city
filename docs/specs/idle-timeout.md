# Spec de implementación: paso a dormida por inactividad

## Feature de origen

- `id`: idle-timeout
- `area`: colector
- `depends_on`: session-state-machine (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Objetivo

Que una sesión que lleva un rato sin emitir eventos (30 min por defecto, configurable) pase sola a `dormida`, para que la torre no muestre como «trabajando» o «para revisar» sesiones abandonadas. `te_necesita` nunca se duerme: una petición pendiente sigue en rojo hasta que se atienda (regla de `docs/domain-model.md`).

## Fuera de alcance

- Cualquier cambio en `packages/web` (colores, animaciones): el front ya recibe el cambio por WebSocket como un `session` normal.
- `review-clears-on-open` (abrir el piso pasa `para_revisar` → `dormida`).
- Persistencia del estado o arranque en frío desde transcripts.
- Retirar sesiones: una sesión dormida sigue en la torre hasta su `SessionEnd`.

## Historia de trabajo

Cuando dejo una sesión abierta y me olvido de ella,
quiero que su piso se apague solo al cabo de un rato,
para que la torre refleje lo que de verdad está vivo.

## Regla

| Estado actual | Sin eventos durante `idleMs` | 
|---|---|
| `trabajando` | → `dormida` |
| `para_revisar` | → `dormida` |
| `te_necesita` | sin cambio |
| `dormida` | sin cambio |

- La inactividad se mide desde `lastEventAt` (cualquier evento de hook la reinicia, también `SubagentStop` y `Notification`).
- El paso a dormida **no** cambia `lastEventAt` (no es un evento) ni `pending`.
- Si llega un evento después, `reduce` lo trata como siempre (p. ej. `UserPromptSubmit` → `trabajando`).

## Configuración

- `CIUDAD_IDLE_MINUTES` (número > 0, admite decimales). Por defecto `30`. Valores no válidos → 30.
- El reloj del colector revisa las sesiones cada `min(30 s, idleMs / 2)`. Con 30 min, la sesión se duerme entre 30 min y 30 min 30 s después de su último evento.

## Enfoque técnico

- `sessions.ts`: función pura `expire(s, now, idleMs)` que devuelve la sesión dormida o `undefined` si no cambia. `reduce` no se toca.
- `SessionStore.tick(now)`: aplica `expire` a todas y notifica `{type:"session"}` por cada cambio. `createSessionStore({ idleMs })`.
- `server.ts`: `setInterval` (con `unref`) que llama a `store.tick(new Date())`; se limpia en `server.close`. Opciones `idleMs` y `tickMs` para tests.
- Los tests usan el reloj inyectado (`now`) en `expire`/`tick` y timers falsos de vitest para el intervalo del servidor.

## Archivos previstos

- `packages/collector/src/sessions.ts` (`expire`, `tick`, opción `idleMs`).
- `packages/collector/src/server.ts` (intervalo y configuración).
- `packages/collector/test/idle.test.ts`.
- `docs/pruebas-manuales.md`, `feature_list.json`, `PROGRESS.md`.

## Escenarios de aceptación

1. **Trabajando se duerme**: sesión en `trabajando` con último evento hace 30 min → `tick` la deja en `dormida` y avisa a los suscriptores.
2. **Aún no**: con 29 min 59 s no cambia ni se notifica.
3. **te_necesita no se duerme**: tras un `PermissionRequest` y 2 h sin eventos sigue en `te_necesita`.
4. **para_revisar se duerme** tras el `Stop` y 30 min.
5. **Configurable**: con `idleMs` = 5 min, se duerme a los 5 min.
6. **Un evento reinicia el reloj** y despierta: tras dormirse, un `UserPromptSubmit` la pone en `trabajando`.
7. **Servidor**: con timers falsos, el intervalo del servidor duerme la sesión y el cliente WS recibe el cambio.

## Plan de verificación

- `./init.sh` en verde con los tests nuevos.
- Prueba real: colector en otro puerto con `CIUDAD_IDLE_MINUTES=0.05` (3 s), eventos con `hook/send.sh` (`CIUDAD_PORT`), y `GET /sessions` antes y después.

## Impacto en la documentación

- `docs/pruebas-manuales.md`: cómo comprobar el paso a dormida con un timeout corto.
