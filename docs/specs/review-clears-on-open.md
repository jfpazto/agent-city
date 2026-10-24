# Spec: review-clears-on-open

## Origen

- Feature: `review-clears-on-open` (front). Depende de `detail-panel-metrics` (accepted).
- Comportamiento visible: Abrir el panel de un piso en para_revisar lo pasa a dormida en el colector y en todas las vistas.
- Verificación: Provocar un Stop, abrir el piso y ver que se apaga. Nota: Necesita un endpoint POST /sessions/:id/reviewed.

## Objetivo

Al abrir el panel de un piso en `para_revisar`, la sesión pasa a `dormida` en el colector y, por WebSocket, en todas las vistas.

## Fuera de alcance

Marcar como revisada desde otro sitio que no sea el panel; deshacer la revisión; cambiar estados distintos de `para_revisar`.

## Decisiones y diseño

- Colector: `review` puro en `sessions.ts` (solo `para_revisar` → `dormida`; el resto no cambia) y `store.markReviewed(id)`, que devuelve si hubo cambio y difunde la sesión por WS.
- `handleReviewed` en `server.ts` para `POST /sessions/:id/reviewed`: 200 `{ok, changed}`; 404 si el id no existe; 403 si el origen no es local (mismo criterio que el WebSocket); 405 con otros métodos; `OPTIONS` responde con CORS solo para orígenes locales.
- Front: `openPanel` (en `main.ts`) llama al endpoint al abrir un piso en `para_revisar`. En modo demo cambia el estado en local, sin red.

## Escenarios

1. Piso en `para_revisar` → abrir su panel → POST 200 `changed: true` → el piso y la barra pasan a dormida.
2. Piso en otro estado → no se llama o `changed: false`; nada cambia.
3. Id desconocido → 404. Origen ajeno → 403. GET → 405.

## Archivos

`collector/src/sessions.ts`, `collector/src/server.ts`, `web/src/main.ts`, `collector/test/reviewed.test.ts`.

## Documentación duradera

`ARCHITECTURE.md` y `docs/pruebas-manuales.md` (sección 11).

## Verificación

- `./init.sh` en verde.
- Colector propio en 127.0.0.1:4395 con arranque en frío (23 sesiones) y Vite en 5174: Stop sintético a una sesión real, abrir su panel y comprobar la barra y `GET /sessions`.

## Checklist del validador

- [ ] Solo `para_revisar` pasa a `dormida`.
- [ ] 404, 403, 405 y OPTIONS como se describe.
- [ ] Todas las vistas se actualizan por WS.
- [ ] El modo demo no hace red.
