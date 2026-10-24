# Spec: detail-panel-metrics

## Origen

- Feature: `detail-panel-metrics` (front). Depende de `tower-render-floors`, `transcript-tool-counts` y `cost-estimate` (accepted).
- Comportamiento visible: al hacer clic en un piso se abre un panel con el título, el estado, el modelo, los tokens, el coste, los recuentos y los archivos; se cierra con Esc.
- Verificación: los datos del panel coinciden con los del colector para una sesión real; se puede usar con el teclado.

## Fuera de alcance

Bitácora (`detail-panel-log`), gráfico semanal, respuestas rápidas, abrir la sesión, marcar como revisada al abrir y consumo «de hoy». El bloque se llama «Esta sesión» porque son totales de la sesión, no del día.

## Diseño (DESIGN.md)

- `<aside role="dialog">` HTML de 360 px a la derecha, bajo la barra, con fondo `panelBg` y texto `panelText` (contraste AA). Se superpone a la torre: en ventanas estrechas, `max-width: 100vw`.
- La cabecera lleva el título y ✕. Debajo van el estado (cuadrado del color más la etiqueta), el modelo, la última actividad («hace 3 min», refrescada cada 5 s) y la carpeta.
- El bloque «Esta sesión» muestra el coste («9,85 $»), los tokens (abreviados, con el total exacto y el desglose: entrada, salida, caché leída y escrita), los comandos, las lecturas, las acciones web y el número de archivos.
- Después va la lista de archivos editados, recortada por la izquierda para que se vea el nombre.
- Si falta un dato, se muestra «—» y nunca un cero inventado.
- Todo el texto va por `textContent`: los títulos y las rutas vienen de los transcripts.

## Interacción

1. Un clic (sin arrastrar) en un piso de sesión abre su panel. En «EN VENTA» o fuera de la torre, lo cierra. Sobre un piso, el cursor es una mano.
2. Esc o ✕ lo cierran y devuelven el foco a donde estaba.
3. Teclado: «/» enfoca el buscador; al escribir aparece «Abrir», que se alcanza con Tab y abre con Intro el panel del piso resaltado. El foco pasa a ✕.
4. Mientras está abierto, se actualiza en vivo con cada mensaje del WebSocket. Si la sesión se cierra, el panel se cierra.

## Archivos

`web/src/panel/model.ts` (puro: `sessionAt`, `panelModel`, `formatUsd`, `relativeTime`), `web/src/panel/DetailPanel.ts`, `web/src/main.ts`, `web/index.html`, `web/test/panel.test.ts`.

## Documentación duradera

Hay que actualizar `ARCHITECTURE.md` y `docs/pruebas-manuales.md`.

## Verificación

- `./init.sh` en verde.
- Con un colector real de 23 sesiones reconstruidas (4396) y Vite en 5174: clic en el piso de una sesión real. Cada campo del panel se compara con `GET /sessions` en el mismo instante, después de que el colector relea el transcript. Después se repite todo el recorrido con el teclado.

## Checklist del validador

- [ ] Los datos coinciden con el colector.
- [ ] Clic, Esc, ✕ y el recorrido con el teclado funcionan, y el foco vuelve a su sitio.
- [ ] Sin dato, «—».
- [ ] Sin `innerHTML` con datos de transcripts.
- [ ] Sin bitácora, gráfico ni respuestas rápidas.
