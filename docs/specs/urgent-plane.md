# Spec: urgent-plane

## Origen

- Feature: `urgent-plane` (front). Depende de `urgent-selector`.
- Comportamiento: mientras haya pisos urgentes, una avioneta pixel art cruza el cielo arrastrando una pancarta «N te necesita(n): título…»; repite mientras siga habiendo urgentes. Clic en la pancarta centra el primer piso urgente. Sin urgentes no aparece.
- Verificación: captura con un piso en rojo >1 min; clic en la pancarta centra el piso; sin urgentes no hay avioneta.

## Objetivo

Que lo que lleva tiempo esperando se vea aunque su piso esté fuera de pantalla.

## Fuera de alcance

Avisos del sistema (`urgent-notification`), sonidos, abrir el panel al pulsar, varias avionetas.

## Escenarios

- Dado un piso en rojo desde hace más de 60 s, la avioneta cruza de izquierda a derecha bajo la barra con «1 te necesita: <título>»; al salir por la derecha, vuelve a entrar.
- Dados 3 urgentes, la pancarta dice «3 te necesitan: <título del que más lleva>…».
- Dada la avioneta en pantalla, al pulsar la pancarta la cámara centra el primer urgente (sin cambiar el zoom, dentro de los límites) y no se abre ningún panel.
- Cuando no queda ningún urgente, la avioneta desaparece al momento.

## Diseño técnico

- Puro en `web/src/urgent/urgent.ts`: `bannerText(urgent)` (título recortado a 32 caracteres) y `planeX(elapsed, viewportW, totalW)` (pasada de `FLIGHT_MS` = 14 s; null al terminar).
- `web/src/urgent/PlaneView.ts`: `Container` en coordenadas de pantalla, encima de la torre y debajo de la barra. Avioneta de 16×10 píxeles (3 px cada uno) con `Graphics`; cuerda; pancarta `panelText` con borde `towerFrame` y una franja `needsYou` a la izquierda; título por `Text` de Pixi. Balanceo vertical de ±2 px.
- Clic: `main.ts` comprueba `plane.hitsBanner` en su `pointerup` del canvas (igual que los pisos) y llama a `centerOn` de la cámara (reutilizada vía `centerFloor`, también usada por el buscador).

## Archivos

`web/src/urgent/urgent.ts`, `web/src/urgent/PlaneView.ts`, `web/src/main.ts`, `web/test/urgent.test.ts`.

## Documentación duradera

`DESIGN.md` (componente avioneta), `docs/pruebas-manuales.md` (sección 12). `ARCHITECTURE.md` ya menciona `web/src/urgent/`.

## Verificación

- `./init.sh` en verde (tests de `bannerText` y `planeX`).
- Colector propio en 4395 + Vite en 5174: `PermissionRequest` sintético → tras 60 s, captura de la avioneta; clic en la pancarta → la cámara sube al piso rojo; `PostToolUse` → desaparece.

## Checklist del validador

- [ ] Sin assets externos; título por `Text`.
- [ ] Solo aparece con urgentes y se repite.
- [ ] Clic en pancarta centra el primer urgente y no abre panel.
