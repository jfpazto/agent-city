# Spec: open-session-link

## Origen

- Feature: `open-session-link` (front). Depende de `detail-panel-metrics` (accepted).
- Comportamiento visible: El botón «Abrir sesión» abre la sesión en la app si hay deep link; si no, copia la ruta y el título de la sesión.
- Verificación: Probar con una sesión real. Nota: Antes, investigar si la app de escritorio tiene deep link.

## Objetivo

El botón «Abrir sesión» ayuda a encontrar la sesión en la app. Como no hay deep link utilizable, copia el título, la carpeta y el id.

## Fuera de alcance

Leer los datos internos de la app de escritorio (privacidad); usar `claude://resume`.

## Decisiones y diseño

- Investigación: la app de escritorio registra el esquema `claude://`. `claude://code/continue?session=` solo acepta ids de escritorio `local_…` (regex `/^local_[A-Za-z0-9-]{1,64}$/`) o «last», no el `session_id` del transcript. `claude://resume?session=<uuid>` importa la sesión del CLI en la app (efecto secundario), así que se descarta. No se pudo leer la correspondencia transcript → id `local_` (los datos de la app quedan fuera de alcance por privacidad).
- Decisión: «Abrir sesión» copia `título\ncarpeta\nsesión <id>` (`sessionClipboardText`) con el mismo mecanismo de copia de `quick-replies-copy` y avisa «Copiados título y carpeta: búscala en la app».
- Respuesta anotada en `docs/risks-and-open-questions.md`.

## Escenarios

1. Pulsar «Abrir sesión» → portapapeles con título, carpeta e id; aviso.
2. Sesión sin carpeta → la línea dice «(carpeta desconocida)», sin «undefined».

## Archivos

`web/src/panel/model.ts`, `web/src/panel/DetailPanel.ts`, `web/test/panel.test.ts`, `docs/risks-and-open-questions.md`.

## Documentación duradera

`ARCHITECTURE.md` y `docs/pruebas-manuales.md` (sección 11) y `docs/risks-and-open-questions.md`.

## Verificación

- `./init.sh` en verde.
- En el navegador: el botón copia el texto esperado.
- Con la app real: pegar en su búsqueda y encontrar la sesión (pendiente del usuario).

## Checklist del validador

- [ ] No se usa `claude://resume` ni se leen datos de la app.
- [ ] Texto copiado correcto.
- [ ] Riesgo anotado.
