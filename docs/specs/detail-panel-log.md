# Spec: detail-panel-log

## Origen

- Feature: `detail-panel-log` (front). Depende de `detail-panel-metrics` (accepted).
- Comportamiento visible: El panel muestra las últimas acciones de la sesión con su hora relativa («Ejecutando comandos», «Escribiendo código»…).
- Verificación: Comparar con el transcript.

## Objetivo

El panel muestra las últimas acciones de la sesión con su hora relativa, la más reciente primero.

## Fuera de alcance

Mostrar el contenido de mensajes o comandos; bitácora de más de 20 entradas; filtros.

## Decisiones y diseño

- El lector de transcripts (`transcript.ts`) traduce cada herramienta a una etiqueta con `actionLabel` y la añade con `pushLog` (máximo 20 entradas; repeticiones seguidas se agrupan como ×N).
- Los mensajes de usuario de texto que no son `isMeta` ni empiezan por «<» se anotan como «Recibió un encargo». Nunca se guarda el contenido.
- `Session.log` (`shared`): `{at, label, count}[]`.
- El panel la pinta con `logLines`: hora relativa · etiqueta (×N), la más reciente primero, por `textContent`.

## Escenarios

1. Varias herramientas Bash seguidas → una línea «Ejecutando comandos ×N».
2. Mensaje de usuario normal → «Recibió un encargo»; mensaje meta o que empieza por «<» → nada.
3. Más de 20 acciones → solo las 20 últimas.

## Archivos

`collector/src/transcript.ts`, `shared/src/index.ts`, `web/src/panel/model.ts`, `web/src/panel/DetailPanel.ts`, `collector/test/log-days.test.ts`, `collector/test/fixtures/transcript-days.jsonl`, `web/test/panel.test.ts`.

## Documentación duradera

`ARCHITECTURE.md` y `docs/pruebas-manuales.md` (sección 11).

## Verificación

- `./init.sh` en verde.
- Bitácora de una sesión real comparada con un recuento independiente en Python sobre una copia congelada del transcript.

## Checklist del validador

- [ ] Sin contenido de mensajes en `log`.
- [ ] Máximo 20 y agrupación ×N.
- [ ] Más reciente primero y sin innerHTML.
