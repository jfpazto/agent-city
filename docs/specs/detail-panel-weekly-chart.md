# Spec: detail-panel-weekly-chart

## Origen

- Feature: `detail-panel-weekly-chart` (front). Depende de `detail-panel-metrics` (accepted).
- Comportamiento visible: El panel muestra las barras de tokens por día de los últimos 7 días de esa sesión.
- Verificación: Fixture con varios días.

## Objetivo

El panel muestra 7 barras con los tokens por día local de esa sesión en los últimos 7 días.

## Fuera de alcance

Coste por día, gráficos de otras sesiones o de toda la torre, más de 7 días.

## Decisiones y diseño

- El lector de transcripts suma los tokens de cada respuesta en el día local de su marca de tiempo (`localDay`, `byDay`); `lastDays` devuelve siempre 7 días, con ceros donde no hubo uso.
- `Session.daily`: `{day, tokens}[]`.
- El panel dibuja 7 barras HTML con `chartBars` (altura proporcional al máximo); la de hoy en verde y con la etiqueta «hoy» (no solo el color); cada barra lleva `title` con el día y los tokens, y el contenedor `role="img"` lleva `aria-description` con la lista «día tokens» (hoy marcado como «hoy»).

## Escenarios

1. Fixture con varios días → los totales caen en su día local y los días vacíos salen a 0.
2. Sin tokens en la semana → 7 barras a 0, sin dividir por cero.
3. Hoy → barra verde.

## Archivos

`collector/src/transcript.ts`, `shared/src/index.ts`, `web/src/panel/model.ts`, `web/src/panel/DetailPanel.ts`, `web/index.html`, `collector/test/log-days.test.ts`, `web/test/panel.test.ts`.

## Documentación duradera

`ARCHITECTURE.md` y `docs/pruebas-manuales.md` (sección 11).

## Verificación

- `./init.sh` en verde.
- Tokens de hoy del colector comparados con una suma a mano en Python sobre una copia congelada del transcript.

## Checklist del validador

- [ ] Día local, no UTC.
- [ ] Siempre 7 barras, con ceros.
- [ ] Hoy en verde y rotulado «hoy»; title por barra y aria-description en el contenedor.
