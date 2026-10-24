# Spec: floor-search

## Origen

- Feature: `floor-search` (front). Depende de `status-bar-counters` y `tower-scroll-zoom` (accepted).
- Comportamiento visible: al escribir en el buscador, la torre se desplaza hasta el piso cuyo título coincide y lo resalta.
- Verificación: buscar una sesión por un fragmento de su título.

## Objetivo

Encontrar una sesión concreta en una torre con decenas de pisos.

## Fuera de alcance

Buscar por carpeta, modelo o contenido; filtrar o esconder pisos; abrir el panel (eso es `detail-panel-metrics`).

## Diseño

- Un `<input type="search">` HTML a la derecha de la barra de estado (Pixi no tiene campo de texto, y así funciona con lectores de pantalla). Usa los colores de la barra y `accent` al enfocarlo. El placeholder es «Buscar piso  /» y la etiqueta accesible, «Buscar piso por título».
- A su izquierda, un `<output aria-live="polite">` con «1/3» o «sin pisos».
- Los tokens de la barra se apartan para dejarle hueco (`SEARCH_W`).
- El piso encontrado lleva un marco de 4 px en `accent` y la cámara lo centra (sin cambiar el zoom, dentro de los límites de la torre).

## Comportamiento

1. Al escribir, va al primer piso (desde abajo) cuyo título contiene el texto. No distingue mayúsculas ni tildes.
2. Intro pasa al siguiente resultado y da la vuelta al final.
3. Esc vacía el buscador, quita el resaltado y le quita el foco.
4. «/» fuera del buscador lo enfoca.
5. Si no hay coincidencias, muestra «sin pisos» y no resalta nada.
6. Si la sesión resaltada se cierra, el resaltado desaparece.

## Archivos

`web/src/hud/search.ts` (puro: `normalize`, `matchSessions`, `nextMatch`), `web/src/tower/camera.ts` (`centerOn`), `web/src/tower/TowerView.ts` (`highlightId`; `update` devuelve la disposición), `web/src/hud/StatusBar.ts`, `web/src/main.ts`, `web/index.html`, `web/test/search.test.ts`.

## Documentación duradera

Hay que actualizar `docs/pruebas-manuales.md`.

## Verificación

- `./init.sh` en verde.
- Con un colector real de 23 sesiones reconstruidas (puerto 4396) y Vite en 5174, buscar «floor-state» lleva a la planta 22, la resalta y muestra «1/1». Buscar «feature» muestra 1/3, e Intro avanza y da la vuelta. Esc limpia y «/» enfoca.

## Checklist del validador

- [ ] Busca por fragmento, sin mayúsculas ni tildes.
- [ ] Se desplaza y resalta.
- [ ] Funciona con el teclado (Intro, Esc, /) y tiene etiqueta accesible.
- [ ] No filtra ni abre el panel.
