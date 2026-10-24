# Spec: status-bar-counters

## Origen

- Feature: `status-bar-counters` (front). Depende de `ws-state-stream` y `transcript-token-parser` (accepted).
- Comportamiento visible: arriba se ven los contadores por estado y los tokens totales, actualizados en vivo.
- Verificación: los contadores coinciden con `GET /sessions`.

## Objetivo

Saber de un vistazo cuántas sesiones hay en cada estado y cuánto se ha consumido, sin recorrer la torre.

## Fuera de alcance

El buscador de pisos (`floor-search`), el coste en la barra, los filtros al hacer clic y el panel.

## Diseño (DESIGN.md)

- La barra queda fija arriba, de 32 px, con fondo `panelBg`.
- Lleva un chip por estado, en el orden trabajando, te necesita, revisar y dormida. Cada chip tiene el icono pixel del estado en su color, que hace de «punto de color», y el número con la etiqueta en `panelText`. El estado nunca se indica solo con el color.
- A la derecha se ve «tokens 10,30 M».
- No se mueve con el scroll ni con el zoom. El tope del scroll deja 48 px sobre el tejado para que la barra no lo tape.

## Decisión

«Tokens totales» suma entrada, salida y lectura y escritura de caché de todas las sesiones vivas. Es lo que procesó el modelo. El formato usa coma decimal y las unidades k, M y G.

## Escenarios

1. Con sesiones en varios estados, cada chip muestra su número y los cuatro suman el total de sesiones.
2. Con la torre vacía, todos los chips están a 0 y se ve «tokens 0».
3. Si una sesión cambia de estado o se cierra, la barra cambia sin recargar.
4. Los números coinciden con `GET /sessions`.
5. En el modo demo, la barra suma las sesiones inventadas.

## Archivos

`web/src/hud/summary.ts` (puro: `summarize` y `formatTokens`), `web/src/hud/StatusBar.ts`, `web/src/main.ts`, `web/src/tower/camera.ts` (`TOP_MARGIN` 48), `web/test/summary.test.ts`.

## Documentación duradera

Hay que actualizar `ARCHITECTURE.md` (una línea sobre el HUD) y `docs/pruebas-manuales.md`.

## Verificación

- `./init.sh` en verde.
- Colector propio en 4397 con tres sesiones sintéticas que apuntan a transcripts reales, y Vite en 5174 con `VITE_COLLECTOR_WS`. La barra se compara con `GET /sessions`, también después de cambiar de estado y de cerrar una sesión.

## Checklist del validador

- [ ] Los contadores y los tokens coinciden con `GET /sessions`.
- [ ] Hay icono y texto, además del color.
- [ ] Se actualiza en vivo.
- [ ] La barra no tapa el tejado al hacer scroll.
- [ ] Sin buscador ni clic.
