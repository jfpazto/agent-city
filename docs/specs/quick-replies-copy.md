# Spec: quick-replies-copy

## Origen

- Feature: `quick-replies-copy` (front). Depende de `detail-panel-metrics` (accepted).
- Comportamiento visible: Los botones de respuesta rápida y el campo de texto copian la respuesta al portapapeles y muestran una confirmación.
- Verificación: Pulsar y pegar en un editor. Nota: No se envía nada a la sesión.

## Objetivo

Tres respuestas rápidas y un campo de texto copian la respuesta al portapapeles y muestran una confirmación.

## Fuera de alcance

Enviar nada a la sesión de Claude Code; guardar las respuestas; editar la lista de respuestas.

## Decisiones y diseño

- `QUICK_REPLIES` en `model.ts`: «Sí, continúa», «No, para aquí», «Explícame el plan antes de seguir».
- Un `textarea` con botón «Copiar».
- Copia con `navigator.clipboard.writeText`; si falla, textarea oculto + `document.execCommand("copy")`.
- El aviso sale en un elemento `role=status` («Copiado: «…»», «Copiada tu respuesta»).

## Escenarios

1. Pulsar «Sí, continúa» → portapapeles con ese texto y aviso.
2. Escribir en el campo y «Copiar» → aviso «Copiada tu respuesta».
3. API asíncrona bloqueada → entra el respaldo y el texto llega igual.

## Archivos

`web/src/panel/model.ts`, `web/src/panel/DetailPanel.ts`, `web/index.html`, `web/test/panel.test.ts`.

## Documentación duradera

`ARCHITECTURE.md` y `docs/pruebas-manuales.md` (sección 11).

## Verificación

- `./init.sh` en verde.
- Pulsar y pegar: en el navegador integrado y con `pbpaste` en el Mac.

## Checklist del validador

- [ ] No hay ninguna llamada de red ni escritura en la sesión.
- [ ] Respaldo con execCommand.
- [ ] Aviso accesible (role=status).
