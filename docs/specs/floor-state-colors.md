# Spec: floor-state-colors

## Origen

- Feature: `floor-state-colors` (área front). Depende de `tower-render-floors` (accepted).
- Comportamiento visible: cada piso se ilumina en verde, rojo (con parpadeo), amarillo o gris según su estado, con icono y etiqueta además del color.
- Verificación del feature_list: provocar cada estado con sesiones reales; el color cambia en menos de 2 s.

## Objetivo

Sustituir la etiqueta provisional en texto plano (`trabajando`, `te_necesita`…) que dejó `tower-render-floors` por la lectura de estado definitiva: brillo del piso con el color del estado, chip con icono pixel y etiqueta legible, y parpadeo suave en rojo.

## Fuera de alcance

- Bocadillo del mensaje (`needs-you-bubble`), scroll y zoom, barra de estado, clic y panel.
- Cambios en `packages/collector` (el timeout de inactividad lo hace `idle-timeout` en otra sesión).
- Fuentes o imágenes externas: los iconos se dibujan con `Graphics` a partir de mapas de bits en código.

## Historia

Cuando miro la torre desde lejos, quiero saber qué sesión me necesita sin leer, para atenderla antes que las demás.

## Escenarios

1. Dado un piso en `trabajando`, cuando se pinta, entonces su fondo lleva un brillo `working` (#3DDC84) y el chip dice «TRABAJANDO» con icono de engranaje.
2. Dado un piso en `te_necesita`, entonces brilla `needsYou` (#E5484D), el chip dice «TE NECESITA» con icono «!», y el brillo parpadea suavemente (opacidad entre 0,35 y 0,85, periodo 1,6 s, sin apagarse del todo).
3. Dado `para_revisar`, entonces brilla `toReview` (#F5C542), chip «REVISAR» con icono de check.
4. Dado `dormida`, entonces el piso queda apagado en `sleeping` (#4A5068), chip «DORMIDA» con icono «z», sin parpadeo.
5. Dado un cambio de estado por WebSocket, cuando llega el mensaje, entonces el color cambia en el siguiente repintado (< 2 s).
6. Los pisos «EN VENTA» no cambian.

## Investigación del repo

Inspeccionados: `DESIGN.md` (tokens y reglas de parpadeo/icono), `docs/specs/tower-render-floors.md`, `packages/web/src/tower/layout.ts`, `packages/web/src/tower/TowerView.ts`, `packages/web/src/main.ts` (modo `?demo=N` con estados rotando), `packages/web/test/layout.test.ts`, `packages/shared` (`SessionState = "trabajando" | "te_necesita" | "para_revisar" | "dormida"`).

## Enfoque técnico

- `layout.ts` (puro):
  - `STATE_STYLE: Record<SessionState, { color; label; icon; blink }>` con los tokens de DESIGN.md.
  - `ICONS`: mapas 7×7 de `0/1` (engranaje, «!», check, «z»).
  - `blinkAlpha(ms)`: `0.6 + 0.25·sin(2π·ms/1600)`, siempre en [0,35, 0,85].
  - `glowAlpha(state, ms)`: `blinkAlpha` si parpadea, 0,55 en el resto; 1 en `dormida` (relleno opaco gris).
- `TowerView.ts`: el piso ocupado se pinta `floorDark` + capa de brillo del color del estado; chip `panelBg` arriba a la derecha de las iniciales con icono (escala 2 px) en el color del estado y etiqueta en `panelText` (contraste AA sobre `panelBg`). Guarda las capas que parpadean y expone `tick(ms)` que solo cambia su `alpha`.
- `main.ts`: `app.ticker.add(() => tower.tick(performance.now()))`.

## Archivos

- `packages/web/src/tower/layout.ts`, `TowerView.ts`, `main.ts`.
- `packages/web/test/stateStyle.test.ts` (nuevo).
- Docs: `docs/pruebas-manuales.md`, `feature_list.json`, `PROGRESS.md`.

## Impacto visual

Según DESIGN.md: rojo/amarillo solo para estados, estado nunca solo por color (icono + etiqueta), parpadeo suave.

## Documentación duradera

- `ARCHITECTURE.md`, `CONSTRAINTS.md`, `AGENTS.md`: no hace falta; no cambia estructura ni reglas.
- `docs/pruebas-manuales.md`: actualizar (colores y parpadeo en `?demo=4`).

## Tareas

1. Funciones puras y tests.
2. Dibujo en `TowerView` y `tick`.
3. Conectar el ticker en `main.ts`.
4. Capturas y documentación.

## Verificación

- `./init.sh` en verde con los tests nuevos.
- `?demo=4` con el panel visible: cuatro pisos con los cuatro colores, iconos y etiquetas; dos capturas separadas ~0,8 s muestran el rojo con distinta intensidad; consola sin errores.
- Con sesiones reales: provocar un permiso y ver el rojo en < 2 s (manual, depende del colector).

## Evidencia

Salida de tests, capturas de `?demo=4`, estado de la consola.

## Checklist del validador

- [ ] Los cuatro estados usan exactamente los tokens de DESIGN.md.
- [ ] Cada piso ocupado tiene icono y etiqueta además del color.
- [ ] Solo `te_necesita` parpadea y nunca llega a opacidad 0.
- [ ] Lógica de estilo en funciones puras con tests.
- [ ] Sin assets externos, sin bocadillo, scroll, clic ni panel; colector intacto.
