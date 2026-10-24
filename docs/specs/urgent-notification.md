# Spec: urgent-notification

## Origen

- Feature: `urgent-notification` (front). Depende de `urgent-selector`.
- Comportamiento: con la pestaña abierta y el permiso concedido (botón en la barra), cada piso que se vuelve urgente genera un aviso del sistema (Notification API) una vez por episodio; varios a la vez, un único aviso agrupado. Clic en el aviso enfoca la pestaña y centra el piso.
- Verificación: tests de la decisión; prueba real (un aviso; sigue en rojo → ninguno más; sale y vuelve → otro).

## Fuera de alcance

Avisos con la pestaña cerrada (service worker), sonidos, `osascript` o cualquier cosa en el colector.

## Escenarios

- Dado el permiso concedido, cuando un piso pasa a urgente, sale un aviso «<título> te necesita» con su último mensaje.
- Dado ese piso aún en rojo, no sale ningún aviso más.
- Cuando sale de rojo y vuelve a ser urgente, sale otro.
- Cuando dos pisos se vuelven urgentes en el mismo cálculo, un aviso «2 sesiones te necesitan» con sus títulos.
- Dado el permiso denegado o sin soporte, nada se rompe; el botón dice «Avisos bloqueados» (desactivado) o no aparece.
- Clic en el aviso: `window.focus()` y la cámara centra el primer piso del aviso.

## Diseño técnico

- Puro en `web/src/urgent/notify.ts`: `decideNotify(notified, urgent)` (avisa los urgentes no avisados; el conjunto se queda solo con los urgentes actuales → episodio nuevo al volver), `notificationContent(list)`, `notifyButton(permission)`.
- `main.ts`: botón `#notify` en la barra (antes del buscador; `SEARCH_W` pasa a 400), `Notification.requestPermission()` al pulsarlo con permiso `default`. `notifyUrgent()` se llama tras cada cálculo de urgentes. Los urgentes que aparecen sin permiso cuentan como avisados (no hay ráfaga al conceder el permiso después). Títulos solo en `title`/`body` de la notificación (texto plano).

## Archivos

`web/src/urgent/notify.ts`, `web/test/notify.test.ts`, `web/src/main.ts`, `web/index.html`, `web/src/hud/StatusBar.ts`.

## Documentación duradera

`docs/pruebas-manuales.md` (sección 13), `DESIGN.md` (botón en la barra).

## Verificación

- `./init.sh` en verde.
- Navegador integrado con colector propio: comprobar el botón según el permiso y la secuencia de avisos. Si el navegador no permite conceder el permiso, se sustituye `window.Notification` por un registro y se dice en la evidencia.

## Checklist del validador

- [ ] Uno por episodio, agrupado.
- [ ] Permiso denegado no rompe nada.
- [ ] Nada en el colector.
