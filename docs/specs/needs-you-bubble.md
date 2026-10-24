# Spec: needs-you-bubble

## Origen

- Feature: `needs-you-bubble` (front). Depende de `floor-state-colors` (accepted).
- Comportamiento visible: un piso en rojo muestra un bocadillo con el último mensaje de Notification.
- Verificación: pedir un permiso en una sesión real y ver el texto.

## Objetivo

Que se lea de un vistazo qué pide la sesión que está en rojo, sin abrir nada.

## Fuera de alcance

- Cambios en el colector: ya rellena `Session.lastMessage` con el `message` de `Notification` (y con «Necesita permiso para X» en `PermissionRequest`).
- Clic, panel, respuestas rápidas, scroll o zoom.

## Escenarios

1. Dado un piso `te_necesita` con `lastMessage`, entonces se ve un bocadillo claro dentro del piso, entre el chip y el título, con el mensaje en hasta 2 líneas de 26 caracteres.
2. Si el mensaje no cabe, la segunda línea acaba en «…». Las palabras más largas que la línea se cortan.
3. Sin `lastMessage` (o vacío) no hay bocadillo.
4. En cualquier otro estado no hay bocadillo, aunque haya `lastMessage`.
5. Al salir de rojo, el bocadillo desaparece en el siguiente repintado.

## Investigación del repo

Inspeccionados: `packages/shared/src` (`Session.lastMessage`), `packages/collector/src/sessions.ts` (lo rellena con `Notification` y `PermissionRequest`), `packages/web/src/tower/layout.ts`, `TowerView.ts`, `main.ts`, DESIGN.md («bocadillo con el último mensaje cuando está en rojo»).

## Enfoque técnico

- `layout.ts` (puro): `wrapText(text, 26, 2)` y `bubbleFor(session)`; la celda de sesión lleva `bubble: string[] | null`.
- `TowerView.drawBubble`: borde `towerFrame`, fondo `floorEmpty`, texto `panelBg` 10 px, pico pixel bajo el chip. Va dentro del piso para no tapar al vecino ni al ascensor.
- Modo demo: las sesiones inventadas llevan un `lastMessage`, así que el piso rojo enseña bocadillo.

## Archivos

`packages/web/src/tower/layout.ts`, `TowerView.ts`, `main.ts`, `packages/web/test/bubble.test.ts`; docs `pruebas-manuales.md`, `feature_list.json`, `PROGRESS.md`.

## Documentación duradera

`ARCHITECTURE.md`, `CONSTRAINTS.md`, `AGENTS.md`: no hace falta. `docs/pruebas-manuales.md`: sí.

## Verificación

- `./init.sh` en verde con `bubble.test.ts`.
- `?demo=4`: el piso rojo enseña «Claude necesita tu permiso para usar Bash» en dos líneas; los demás, sin bocadillo; consola sin errores.
- Real: pedir un permiso en una sesión y ver el texto (manual, lo hace el usuario).

## Checklist del validador

- [ ] Solo `te_necesita` con mensaje muestra bocadillo.
- [ ] Texto partido y recortado según los escenarios, con tests.
- [ ] El bocadillo no se sale del piso.
- [ ] Colector intacto; sin clic ni panel.
