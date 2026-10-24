# Spec: tower-scroll-zoom

## Origen

- Feature: `tower-scroll-zoom` (front). Depende de `tower-render-floors` (accepted).
- Comportamiento visible: con muchas sesiones, la torre se recorre con scroll vertical y se acerca o aleja con la rueda.
- Verificación: simular 40 sesiones y recorrer la torre a más de 50 fps.

## Objetivo

Que la torre siga siendo usable cuando no cabe en la ventana (riesgo de `docs/risks-and-open-questions.md`).

## Decisión

DESIGN.md pide «scroll vertical y zoom con la rueda». Para que no choquen: **rueda = scroll vertical**; **Ctrl/⌘ + rueda = zoom hacia el cursor** (el pellizco del trackpad llega como rueda con `ctrlKey`, así que también hace zoom).

## Fuera de alcance

Arrastrar con el ratón, teclado, botones de zoom, buscador, clic y panel. Guardar la posición entre recargas.

## Escenarios

1. Al cargar se ve el suelo abajo (la planta 0), como antes.
2. Si la torre cabe, la rueda no mueve nada.
3. Con 40 sesiones, la rueda hacia arriba sube hasta ver el tejado con 16 px de margen y no pasa de ahí; hacia abajo no baja del suelo.
4. Ctrl/⌘ + rueda acerca o aleja entre 0,5× y 2×, con el punto bajo el cursor fijo.
5. Alejada, la torre queda centrada en horizontal; acercada, no aparecen huecos a los lados ni bajo el suelo.
6. La línea «colector: …» no se mueve ni se escala.
7. Recorrer 40 sesiones va a más de 50 fps.

## Investigación del repo

Inspeccionados: `packages/web/src/main.ts`, `tower/TowerView.ts`, `tower/layout.ts` (la torre crece hacia arriba desde `groundY`; `tower.y` es negativo cuando no cabe), DESIGN.md.

## Enfoque técnico

- `tower/camera.ts` (puro): `Camera {x, y, zoom}`, `clampCamera`, `scrollBy`, `zoomAt`, `wheelZoomFactor`, `worldBounds`.
- `TowerView.update` devuelve `tower.y`; `main.ts` guarda la cámara, escucha `wheel` (no pasivo, `preventDefault`) y aplica posición y escala a `tower.root`. Reajusta en cada `update` y al redimensionar.
- Rendimiento: mover la cámara no redibuja; solo cambia la transformación del contenedor.

## Archivos

`packages/web/src/tower/camera.ts` (nuevo), `TowerView.ts`, `main.ts`, `packages/web/test/camera.test.ts`; docs `pruebas-manuales.md`, `feature_list.json`, `PROGRESS.md`.

## Documentación duradera

`ARCHITECTURE.md`, `CONSTRAINTS.md`, `AGENTS.md`: no hace falta. `docs/pruebas-manuales.md`: sí.

## Verificación

- `./init.sh` en verde con `camera.test.ts`.
- `?demo=40` en el navegador integrado: capturas abajo, arriba (tejado) y alejada; fps medidos con `requestAnimationFrame` mientras se disparan eventos de rueda; consola sin errores.

## Checklist del validador

- [ ] Rueda = scroll, Ctrl/⌘ + rueda = zoom hacia el cursor, entre 0,5 y 2.
- [ ] Sin huecos por debajo del suelo ni por encima del tejado.
- [ ] Más de 50 fps con 40 sesiones.
- [ ] Lógica de cámara pura con tests; sin clic, panel ni buscador.
