# Pruebas manuales

Guía para comprobar a mano lo que hace la Ciudad hoy. **Se actualiza con cada feature que cambie algo visible o cómo se arranca** (regla en `AGENTS.md`).

Última actualización: 2026-10-19, con `city-neighborhood-map` implementada.

## 0. Preparación (una vez)

```bash
cd <carpeta del repo> && ./init.sh
```
Debe terminar con todos los tests en verde.

Hooks de Claude Code (si no están ya instalados; conservan tus hooks propios y dejan copia):
```bash
npm run hooks:install
```

## 1. Colector siempre encendido (recomendado)

Instala un LaunchAgent de usuario que arranca el colector al iniciar sesión y lo reinicia si se cae. Así no se pierden eventos.
```bash
npm run autostart:install
```
- Estado: `npm run autostart:status`
- Log: `data/collector.log`
- Quitarlo: `npm run autostart:uninstall`
- Tras cambiar código del colector, reinícialo: `npm run autostart:uninstall && npm run autostart:install`

Si no usas el autoarranque, el colector y el front se arrancan juntos con `npm run dev`. En ese caso **los eventos que ocurran con el colector apagado se pierden** (las sesiones siguen funcionando con normalidad).

## 2. Front

- Con el autoarranque: `npm run dev:web` (solo Vite).
- Sin el autoarranque: `npm run dev` (colector y Vite).

Abre **http://localhost:5173**. La entrada es un mapa superior 2.5D con manzanas, árboles, calles y dos barrios rotulados: Claude y Codex. Cada pareja proyecto/proveedor tiene su edificio. Hoy las sesiones reales que recoge el colector son Claude; el barrio Codex queda vacío hasta integrar su recogida. La demo permite comprobar ambos sin inventar datos en la vista real.

- Arriba: contadores por estado y tokens totales. Deben coincidir con `/sessions`; en ventanas estrechas los contadores conservan icono y número. El buscador pasa a otra fila sin taparlos.
- Navegación: «Toda la ciudad», «Claude», «Codex», selector «Ir a un proyecto…», zoom, «Puentes» y «Vida». Se adapta en varias filas; mapa y paneles empiezan debajo de la barra.
- Mapa: arrastra para recorrer ambos ejes; rueda o −/+ para zoom hacia el cursor/centro. Un arrastre no entra en un edificio. Cada azotea o su rótulo permite entrar; el selector da acceso con teclado aunque el edificio quede fuera de pantalla. Al alejar mucho, los rótulos se simplifican a señales de estado.
- Fachada: un piso vertical por sesión, con iluminación, icono/texto, título y un pequeño interior. En rojo, bocadillo de permiso. Los huecos siguen «EN VENTA» y hay uno libre arriba. Usa rueda para subir/bajar y Ctrl/⌘ + rueda para zoom. «Abrir una sesión…» permite elegir un piso con teclado.
- Clic en piso o selector de sesión: panel con proyecto, modelo, métricas, archivos y bitácora. Se actualiza solo; Esc/✕ cierra y devuelve el foco. En escritorio la fachada deja espacio al panel; en ventanas pequeñas se superpone.
- «← Volver al mapa»: conserva posición y zoom. El buscador encuentra proyecto, título o proveedor sin distinguir tildes/mayúsculas; Intro recorre resultados y «Abrir» muestra su panel. «/» enfoca el buscador salvo que estés escribiendo en otro campo. Escribir en él con el panel abierto no debe perder el foco.
- Lo urgente sigue llevando a la fachada y al piso correcto, desde la pancarta o el aviso, sin abrir el panel automáticamente.
- Solares y relaciones se guardan en este navegador/origen; los edificios van del proyecto trabajado más recientemente (arriba a la izquierda) al más antiguo; compáralo con `lastEventAt` de `/sessions`. Al trabajar en un proyecto, sube al primer solar (2026-10-20). Los pisos se reconstruyen al reiniciar el colector.

Demo: `?demo=24&projects=4` (8 edificios, 4 por proveedor; 4 puentes automáticos), `?demo=0` (barrios vacíos), `?demo=20&projects=1` (un edificio alto por proveedor), `?demo=80&projects=16` (varias filas). La demo no usa el colector ni escribe relaciones sobre los proyectos reales.

## 3. Estados con una sesión real

1. Abre una sesión nueva en la app de escritorio con el modo **«Pedir permiso»** y entra en su edificio en la Ciudad para observar el piso. En el mapa, los cambios se ven también en las señales de la azotea.
2. Pídele algo que requiera permiso (por ejemplo, crear un archivo en el Escritorio).
3. Sin recargar el navegador, comprueba:

| Momento | Estado esperado |
|---|---|
| Trabajando | `trabajando` (verde) |
| Pide permiso | `te_necesita` (rojo parpadeando en menos de 2 s, con bocadillo que dice qué pide) |
| Apruebas | `trabajando` (verde) |
| Termina | `para_revisar` (amarillo) |
| Cierras la sesión | desaparece |

## 4. Estado sin el front

```bash
curl -s 127.0.0.1:4317/sessions | python3 -m json.tool
```

## 5. Reconexión

Para el colector (`npm run autostart:uninstall`, o Ctrl+C en `npm run dev`). La línea de abajo a la izquierda pasa a `colector: desconectado`. Vuelve a arrancarlo: en unos segundos pasa solo a `conectado`, sin recargar.

## 6. Eventos en crudo

```bash
tail -f data/events/$(date +%F).jsonl
```
Contienen tus prompts y salidas de herramientas: `data/` está ignorado por git y no sale de tu Mac.

## 7. Seguridad: orígenes ajenos

```bash
curl -s -o /dev/null -w '%{http_code}\n' -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGVzdGtleTEyMzQ1Njc4OQ==" -H "Origin: https://evil.example" 127.0.0.1:4317/ws
```
Debe devolver `403`.

## 8. Paso a dormida por inactividad (2026-10-19)

Las sesiones sin eventos durante 30 min pasan a `dormida`, salvo las que están en `te_necesita`. Se configura con `CIUDAD_IDLE_MINUTES`. Para probarlo rápido sin tocar el colector de 4317, arranca otro en 4399 con 3 s de inactividad:

```bash
CIUDAD_DATA_DIR=$(mktemp -d) COLLECTOR_PORT=4399 CIUDAD_IDLE_MINUTES=0.05 npx tsx packages/collector/src/main.ts
```
En otra terminal:
```bash
echo '{"session_id":"prueba","hook_event_name":"UserPromptSubmit","cwd":"/tmp/x"}' | CIUDAD_PORT=4399 sh packages/collector/hook/send.sh; sleep 5; curl -s 127.0.0.1:4399/sessions
```
Resultado esperado: la sesión `prueba` aparece en `dormida`. Si antes envías un `PermissionRequest`, se queda en `te_necesita`. Un evento nuevo la despierta.

## 9. Tokens y modelo del transcript (2026-10-19)

Con el colector en marcha y una sesión activa:

```bash
curl -s http://127.0.0.1:4317/sessions | python3 -m json.tool
```

Cada sesión con transcript lleva `model` (p. ej., `claude-opus-5-5`), `tokens` (`input`, `output`, `cacheRead`, `cacheCreation`), `costUsd` (coste estimado en $ a precio de API; vacío si algún modelo no está en la tabla), `tools` (`commands` = Bash, `reads` = Read/Grep/Glob, `web` = WebFetch/WebSearch) y `editedFiles` (rutas editadas, sin repetir). Para cambiar los precios: `CIUDAD_PRICES_FILE=/ruta/precios.json` con `{"modelo": {"input": 4, "output": 20, "cacheRead": 0.2, "cacheWrite": 5, "cacheWrite1h": 8}}` ($ por millón; `cacheWrite1h` es la escritura de caché de 1 h, opcional, por defecto 2 × `input`). Al seguir trabajando en la sesión, los números suben tras cada herramienta o al terminar. Una sesión recién abierta, sin respuestas todavía, no tiene `tokens` hasta su primera respuesta. La barra de arriba ya suma los tokens; el coste, los recuentos y los archivos se verán en el panel de detalle.

## 10. Reconstrucción al arrancar (2026-10-19)

1. Con varias sesiones de Claude Code usadas hoy, reinicia el colector (`npm run autostart:uninstall && npm run autostart:install`, o corta y vuelve a lanzar `npm run dev`).
2. En el log aparece `[collector] arranque en frío: N sesiones`.
3. N es el número de `.jsonl` de primer nivel tocados en los últimos 2 días (desde 2026-10-21; `CIUDAD_CLAUDE_DAYS` lo cambia):

```bash
find ~/.claude/projects -mindepth 2 -maxdepth 2 -name '*.jsonl' -mtime -1 | wc -l
```

4. En sus edificios salen todas en gris («DORMIDA»), con su título y sin hueco entre plantas de cada edificio. Al escribir en una de ellas, su piso se enciende sin moverse.

## 11. Panel: revisar, bitácora, gráfico, respuestas y abrir sesión (2026-10-19)

Con `npm run dev` y el front en http://localhost:5173:

1. **Revisar al abrir**: termina un turno en una sesión (piso amarillo, «revisar» en la barra). Abre su panel (clic o «/» + «Abrir»). Resultado: el piso pasa a gris, la barra resta 1 a «revisar» y suma 1 a «dormida», y `curl -s http://127.0.0.1:4317/sessions` la da `dormida`. Con un origen ajeno, `curl -X POST -H 'Origin: https://ejemplo.com' http://127.0.0.1:4317/sessions/<id>/reviewed` da 403.
2. **Bitácora**: el panel lista hasta 20 acciones («Ejecutando comandos ×3», «Recibió un encargo»…) con hora relativa, la más reciente arriba. Nunca aparece el texto de los mensajes.
3. **Gráfico semanal**: 7 barras (tokens por día local); la de hoy en verde; al pasar el ratón se ve el día y los tokens.
4. **Respuestas rápidas**: pulsa «Sí, continúa» y pega en un editor: aparece ese texto y el aviso «Copiado: «Sí, continúa»». Escribe en el campo y pulsa «Copiar»: aviso «Copiada tu respuesta». No se envía nada a la sesión.
5. **Abrir sesión**: copia título, carpeta y `sesión <id>` y avisa «Copiados título y carpeta: búscala en la app». Pégalo en la búsqueda de la app de escritorio para encontrarla (no hay deep link utilizable).
6. **Buscador**: con texto escrito, si llegan sesiones nuevas el contador de resultados se actualiza solo.

## 12. Avioneta de lo urgente (2026-10-19)

Con `npm run dev` y el front en http://localhost:5173:

1. Deja una sesión esperando un permiso (piso rojo) más de 1 minuto.
2. Resultado: una avioneta pixel art cruza el cielo bajo la barra con la pancarta «1 te necesita: <título>»; al salir por la derecha vuelve a entrar. Con varios, «N te necesitan: <título del que más lleva>…».
3. Desde el mapa o desde otro edificio, pulsa la pancarta: se abre la fachada del proyecto/proveedor correcto y se centra el piso rojo (no se abre el panel).
4. Responde al permiso: la avioneta desaparece.
5. Para no esperar el minuto (solo en desarrollo): http://localhost:5173/?urgentMs=5000.

## 13. Aviso del navegador de lo urgente (2026-10-19)

Con el front en http://localhost:5173 abierto en una pestaña:

1. Pulsa «Activar avisos» en la barra y acepta el permiso del navegador. El botón pasa a «Avisos activados» (si lo deniegas, «Avisos bloqueados» y todo sigue funcionando).
2. Deja una sesión esperando un permiso más de 1 minuto: sale un aviso del sistema «<título> te necesita» con su último mensaje.
3. Sigue sin responder: no sale ningún aviso más.
4. Responde y vuelve a dejarla esperando más de 1 minuto: sale otro aviso.
5. Si dos sesiones se vuelven urgentes a la vez: un único aviso «2 sesiones te necesitan».
6. Pulsa el aviso: el navegador vuelve a la pestaña y la Ciudad revela la fachada y ese piso, incluso si estabas en otro barrio.
7. Para no esperar el minuto (solo en desarrollo): `?urgentMs=5000`.

## 14. Barrios, puentes y vida ambiental (2026-10-19)

1. Abre `http://localhost:5173/?demo=24&projects=4`: ocho edificios y cuatro pasarelas automáticas, una por proyecto compartido entre Claude y Codex. Cada edificio tiene tres sesiones solo de su proveedor.
2. Acerca con +, arrastra, entra a un edificio y vuelve al mapa. Resultado: mismo encuadre. Con teclado, usa «Ir a un proyecto…», «Abrir una sesión…» y Esc para cerrar el panel.
3. Abre «Puentes»: lista los cuatro proyectos compartidos. Elige FrontAgentico → Segundo cerebro y «Crear puente». Resultado: una relación manual y dos pasarelas nuevas (una por barrio), total seis puentes.
4. Recarga y abre Puentes: la relación continúa. «Quitar» deja las cuatro automáticas; no borra las sesiones ni otras relaciones. Relacionar el mismo proyecto consigo mismo o invertir un vínculo ya creado no lo duplica.
5. «Vida: no»: coches, personajes y brillo dejan de moverse; las señales siguen visibles. «Vida: sí» los reactiva. Si el sistema prefiere movimiento reducido, el control indica «Movimiento reducido» y la avioneta mantiene una pancarta estática.
6. Con `?demo=4&projects=2&urgentMs=1000` (solo desarrollo), espera a que la sesión roja se vuelva urgente. Desde el mapa, la pancarta debe llevar a su fachada; arrastrar sobre ella no cuenta como clic.
7. Prueba `?demo=0`: ningún edificio ni métrica ficticia; barrios vacíos. Con `?demo=20&projects=1`, recorre la fachada alta. En ventana estrecha, las barras se reordenan y los selectores siguen accesibles.
8. Vuelve a la URL sin demo: preferencias y relaciones reales están separadas de las de prueba. Compara edificios/sesiones con `/sessions`; sin `agent` las sesiones pertenecen a Claude. No debe aparecer ningún edificio Codex inventado.
9. Fachada con entorno (2026-10-20): entra a un edificio. Resultado: detrás hay sol, nubes y un skyline lejano con ventanas encendidas; a los lados, árboles, farolas y bancos que nunca tapan el edificio; peatones por la acera y coches por la calzada, visible entera encima de la barra inferior. Con «Vida: sí» nubes, peatones y coches avanzan y vuelven a entrar por el otro borde; con «Vida: no» se quedan quietos.
10. Si el navegador bloquea `localStorage`, la vista sigue funcionando. Al crear un puente informa de que no pudo guardarlo; se conserva durante esa pestaña. No se envían mensajes ni se infieren relaciones del texto de las conversaciones.

## 15. Abrir la sesión desde su piso (2026-10-20)

1. Reinicia el colector (`npm run dev`) para que cargue la ruta nueva.
2. Entra a un edificio con sesiones reales. Cada piso con sesión tiene un botón morado ▶ arriba a la derecha.
3. Pulsa ▶ en una sesión de la app de escritorio. Resultado: la app de Claude salta a esa sesión, sin duplicarla, y la barra inferior dice «… abierta en la app de Claude». En una sesión lanzada desde la terminal (sin archivo `local_…`), se abre Terminal en la carpeta del proyecto con `claude --resume <id>` y la barra dice «… abierta en Terminal»; la primera vez macOS puede pedir permiso para que Node controle Terminal.
4. Pulsa en otra parte del piso: se abre el panel como antes, sin lanzar nada.
5. En demo (`?demo=6`), ▶ solo avisa «Demostración: aquí se abriría…».
   El colector del servicio se reinicia con `kill $(lsof -tiTCP:4317 -sTCP:LISTEN)`; launchd lo relanza con el código actual. Con el colector apagado avisa «¿está el colector encendido?».
6. Seguridad: `curl -X POST http://127.0.0.1:4317/sessions/<id>/open` sin cabecera Origin responde 403; solo acepta páginas locales y ids UUID de sesiones conocidas.

## 16. Proyectos de Codex en su barrio (2026-10-21)

1. Reinicia el colector (`kill $(lsof -tiTCP:4317 -sTCP:LISTEN)` si corre como servicio, o `npm run dev`). Su log dice «Codex: N sesiones».
2. Abre `http://localhost:5173`. Resultado: el barrio Codex muestra un edificio por proyecto (carpeta o repo Git) con las sesiones de Codex de los últimos 7 días (`CIUDAD_CODEX_DAYS` para cambiarlo). Los subagentes no son pisos propios. Un proyecto con sesiones en Claude y en Codex tiene puente automático.
3. Entra a un edificio Codex: cada piso lleva el título del hilo de Codex, modelo, tokens y bitácora (solo tipos de acción, nunca texto). El coste sale vacío porque los modelos de OpenAI no están en la tabla de precios.
4. Escribe algo en Codex en un proyecto: en unos 3 s el piso pasa a verde (trabajando) y al terminar el turno a amarillo (para revisar). Abrir el panel lo deja dormido y no vuelve a amarillo hasta el siguiente turno. Sin actividad 30 min, dormido.
5. ▶ en un piso Codex abre ese hilo en la app de escritorio de Codex (`codex://threads/<id>`) y la barra dice «… abierta en la app de Codex». Si la app no está o falla, abre Terminal con `codex resume <id>` en la carpeta del proyecto.
6. Comprobación rápida: `curl -s 127.0.0.1:4317/sessions` lista las sesiones con `"agent":"codex"`.
7. Límite: no hay rojo («te necesita») en Codex; eso requiere sus hooks (`codex-event-probe`).

## 17. Banderas de estado en el mapa (2026-10-21)

1. Abre `http://localhost:5173/?demo=24&projects=4`. Resultado: cada rótulo de edificio muestra banderas con número: roja parpadeante = requiere aprobación, verde = trabajando, amarilla = finalizada, gris = dormida. Solo salen los estados que tiene ese edificio, en ese orden.
2. Abajo a la izquierda hay una leyenda con las cuatro banderas. Al entrar a un edificio desaparece; al volver al mapa reaparece.
3. Pasa el ratón por una bandera: dice «N trabajando», «N aprobación», etc. Un lector de pantalla lee el desglose completo en el botón del edificio.
4. Con movimiento reducido del sistema, la bandera roja no parpadea.

## 18. Señal de humo y avisos al responder (2026-10-21)

1. Abre `http://localhost:5173/?demo=24&projects=4`. Resultado (cambiado el 2026-10-24): los edificios con bandera verde echan humo gris; los de bandera amarilla muestran un cartel amarillo ✓ flotando. La leyenda incluye «💨 Trabajando ahora» y «✓ Lista para revisar».
2. Con sesiones reales: escribe algo en Claude o Codex y espera a que termine el turno. Resultado: mientras trabaja, el edificio echa humo; al terminar, en 1–3 s el humo se va, aparece el cartel ✓, la barra inferior dice «✓ <título> ya respondió» y, si los avisos están permitidos, llega una notificación «… ya respondió»; al pulsarla se abre la fachada de esa sesión. Al abrir el piso (revisado) el cartel ✓ desaparece.
3. Al recargar la página no avisa de lo que ya estaba terminado; solo de lo que termina a partir de entonces.
4. Si el botón dice «Avisos bloqueados», pasa el ratón: explica cómo activarlos (candado de la barra de direcciones → Notificaciones → Permitir, y recargar). En macOS, además, el navegador debe tener permiso en Ajustes del Sistema → Notificaciones.

## 19. Clic fuera del edificio vuelve al mapa (2026-10-21)

1. Abre `http://localhost:5173/?demo=24&projects=4` y entra a un edificio.
2. Haz clic en un piso: se abre su panel. Clic en el lateral, la placa o un «EN VENTA»: se cierra el panel y sigues en la fachada.
3. Haz clic en el cielo o en la calle, fuera del edificio. Resultado: vuelves al mapa superior con el mismo encuadre y la barra dice «De vuelta al mapa · posición conservada».
4. Arrastra desde el cielo para desplazar la fachada: no vuelve al mapa (solo cuenta un clic sin movimiento).

## 20. Pisos de la más reciente a la más antigua (2026-10-21)

1. Entra a un edificio con varias sesiones reales.
2. Resultado: de arriba abajo, la sesión con actividad más reciente está justo bajo «EN VENTA» y la más antigua en la planta baja. Compara con `curl -s 127.0.0.1:4317/sessions` ordenando por `lastEventAt`.
3. Escribe en una sesión de un piso bajo: al recibir su evento sube al piso de arriba y las demás bajan uno.

## 21. Sesión nueva y eliminar desde la fachada (2026-10-21)

1. Reinicia el colector (`kill $(lsof -tiTCP:4317 -sTCP:LISTEN)`) para que cargue las rutas nuevas.
2. Entra a un edificio. El piso «EN VENTA» dice «+ clic: nueva sesión». Púlsalo. Resultado: se abre la app de Claude (o de Codex en su barrio) con una sesión nueva en la carpeta del proyecto, y la barra dice «Sesión nueva de <proyecto> abierta en la app…». Si la app falla, Terminal con `claude`/`codex` en esa carpeta.
3. Arrastra un piso dormido o amarillo hacia la derecha: aparece una franja roja «Eliminar →» y, pasados 120 px, «Suelta: eliminar». Suelta: pide confirmación. Acepta. Resultado: el piso desaparece, los de encima bajan y la barra dice «… eliminada (está en la Papelera)». En la Papelera del Finder está su `.jsonl` (y la carpeta con su id, en Claude); arrastrándolos de vuelta a su carpeta se recupera.
4. Cancela la confirmación, o suelta antes de 120 px: el piso vuelve a su sitio y no se borra nada.
5. Intenta eliminar una sesión verde o roja: la barra dice «No se puede eliminar una sesión activa».
6. Arrastrar en vertical o hacia la izquierda sigue moviendo la vista.
7. Seguridad: `curl -X POST 127.0.0.1:4317/sessions/<id>/delete` sin Origin responde 403.
8. En demo (`?demo=24&projects=4`): el clic en «EN VENTA» solo avisa y el deslizamiento retira el piso de la demo.

## 22. Límites de uso: depósito y central (2026-10-21)

1. Reinicia el colector (`launchctl kickstart -k gui/$(id -u)/com.ciudad-de-agentes.collector` o `npm run dev`).
2. Codex: abre la ciudad. Arriba a la derecha del barrio Codex hay una central con batería (5 h) y cuatro pilas (semana), y un rótulo con lo que queda (de cerca, con la hora de recarga). Compara con el último `rate_limits` de `~/.codex/sessions`: queda = 100 − `used_percent`. Si su `resets_at` ya pasó, la batería está llena y pone «recargado».
3. Claude: ejecuta `npm run hooks:install` (añade la statusline si no tienes otra) y escribe en una sesión de Claude Code. El depósito (5 h) y el embalse (semana) se llenan con lo que queda; compáralo con `/usage` en Claude Code. Sin statusline, o con API key, pone «sin dato».
4. Pasa el ratón por el rótulo: aparece la frase completa («Límite de Codex · 5 h: quedan… · semana: …»).
5. Demo `?demo=24&projects=4`: Claude con un 32 % (azul) y Codex con un 6 % (ámbar, vapor en la chimenea). Con «Vida: no» el vapor y el goteo se detienen, y el nivel y el texto se quedan.
6. Por debajo del 10 % en 5 h, el depósito gotea; con el límite agotado, el barrio queda a media luz y el rótulo pasa a rojo.
7. Seguridad: `curl -X POST -H 'Origin: https://ajeno.example' 127.0.0.1:4317/usage/claude -d '{}'` responde 403; `data/usage.json` no contiene nada más que los límites.

## 23. Endurecimiento del colector, sonido e instalador (2026-10-22)

1. Reinicia el colector (`launchctl kickstart -k gui/$(id -u)/com.ciudad-de-agentes.collector` o `npm run dev`).
2. Una web no puede falsear estados: `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://localhost:5173' -H 'content-type: application/json' 127.0.0.1:4317/hook -d '{}'` responde 403; con `-H 'content-type: text/plain'` y sin Origin, 415. No uses un `session_id` inventado con JSON válido: crearía un piso falso (se retira enviando `SessionEnd` con ese id). Los hooks reales (curl sin Origin y con JSON) siguen llegando: los pisos cambian de color al escribir en una sesión.
3. Otro servidor local no puede abrir, crear ni borrar: `curl -s -o /dev/null -w '%{http_code}' -X POST -H 'Origin: http://localhost:3000' 127.0.0.1:4317/sessions/x/open` responde 403. Si sirves el front en otro puerto, añádelo con `CIUDAD_WEB_PORTS=5174`.
4. `tail -1 data/events/$(date +%F).jsonl`: solo metadatos y un campo `omitted` con los nombres de lo no guardado (por ejemplo `prompt`, `tool_input`). Con `CIUDAD_EVENTS_FULL=1` se guarda íntegro. Los archivos de más de 7 días desaparecen (`CIUDAD_EVENTS_DAYS`).
5. Barra de navegación: botón «Sonido: no». Púlsalo: pasa a «Sonido: sí» y suena una campanilla de prueba. Desde ese momento suena al pasar un piso a rojo más de 1 min (dos tonos que suben) y cuando una sesión ya respondió (dos que bajan). Se conserva al recargar.
6. Instalación limpia: `CLAUDE_SETTINGS_PATH=$(mktemp -d)/x/settings.json npm run hooks:install` crea el archivo con los hooks y dice «archivo nuevo».
7. Un piso en rojo sin ningún evento en 48 h pasa a dormida (sesión cerrada sin `SessionEnd`).
8. Subagentes: abre el panel de una sesión de Claude que haya delegado en subagentes (tiene carpeta `~/.claude/projects/<proyecto>/<id>/subagents/`). Los tokens y el coste incluyen los de sus subagentes; antes solo contaban los de la principal.

## 24. Hooks de Codex (2026-10-23)

1. `npm run hooks:install:codex` crea o amplía `~/.codex/hooks.json` (copia `.bak-*` si ya existía). Repetirlo no duplica.
2. Abre `codex` en modo interactivo: la pantalla de revisión pide aprobar los hooks de `ciudad-de-agentes`. Apruébalos (sin esto Codex no los ejecuta).
3. Con el colector arrancado, pide a Codex leer un archivo y algo que pida permiso. Resultado esperado: en `data/events/AAAA-MM-DD.jsonl` aparecen líneas con `"agent":"codex"` (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PermissionRequest`, `Stop`…) y `GET /sessions` no cambia por ellas (los pisos de Codex salen de los rollouts).
4. Colector apagado: `echo '{}' | CIUDAD_PORT=4399 packages/collector/hook/send.sh codex` sale al instante con código 0.
5. `npm run hooks:uninstall:codex` deja el archivo como estaba o lo borra si lo creó el instalador.

## 25. Subagentes en el piso (2026-10-24)

1. Demo `?demo=12`: entra en FrontAgentico de Claude. El piso «Panel de métricas 2» tiene 3 ayudantes pequeños con camiseta morada a la derecha del monitor; con más de 3 aparece «+N». Con «Vida: sí» se mueven; con «Vida: no», quietos.
2. Clic en ese piso: el panel muestra «Subagentes: 3 trabajando · 5 en total». Una sesión de Codex muestra «—».
3. Datos reales: en una sesión de Claude pide algo que lance subagentes (p. ej. «usa un agente Explore para…»). Mientras trabajan, el piso enseña un ayudante por subagente; al terminar cada uno (`SubagentStop`) desaparece su ayudante, y el total del panel sube.
4. Una sesión dormida nunca muestra ayudantes.

## 26. Avería y contexto por piso (2026-10-24)

1. Demo `?demo=12`, edificio Portafolio de Claude: el piso «Revisión de cambios 1» muestra el cartel «AVERÍA · límite de uso» con franja naranja en lugar de la mesa; el chip sigue diciendo REVISAR.
2. Bajo la placa de cada piso de Claude hay una barra con el porcentaje: 35 % gris, 72 % ámbar y 91 %! naranja. Se lee sobre el verde, el amarillo y el gris.
3. Clic en el piso averiado: el panel muestra «Contexto: 91 % usado» y «Avería: límite de uso (hace …)». En Codex, las dos filas dicen «—».
4. Datos reales (contexto): con la statusline de la Ciudad instalada, escribe algo en una sesión de `claude` abierta en Terminal (la app de escritorio no ejecuta la statusline); su piso enseña la barra con el mismo % que `/context`. Una sesión cerrada no tiene barra.
5. Datos reales (avería): cuando Claude Code responde con un error (límite de uso, OAuth caducado), el piso enseña la avería; la siguiente respuesta buena la quita.

## 27. Banderines de proyectos relacionados (2026-10-24)

Sustituyen a las pasarelas del apartado 14: donde allí se habla de pasarelas, ahora hay banderines.

1. Demo `?demo=12`: no hay líneas entre edificios. Cada proyecto que está en Claude y en Codex lleva el mismo banderín en sus dos azoteas: FrontAgentico turquesa, Segundo cerebro rosa, Portafolio azul y PriceMap violeta.
2. En «Puentes», vincula FrontAgentico → Segundo cerebro: los cuatro edificios pasan a compartir un solo color. «Quitar» les devuelve sus colores.
3. Un edificio sin relaciones no lleva banderín.

## 28. Rebobinar un día (2026-10-24)

1. Con el colector arrancado, abre `http://localhost:5173` y pulsa «Rebobinar». Abajo a la derecha aparece una barra con el día («Hoy»), «▶ Reproducir», un deslizador, la hora y «Volver al directo». Empieza en el primer momento del día con alguna sesión activa.
2. Elige «Ayer» y mueve el deslizador: los edificios de Claude aparecen, cambian de bandera, echan humo o muestran el cartel ✓ según la hora. El barrio Codex también se mueve (desde el 2026-10-24): sus sesiones aparecen cuando empezó su primer turno, trabajando si tenían un turno abierto en ese momento, luego para revisar y, pasada la inactividad, dormidas. La barra superior dice «tokens 0».
3. «▶ Reproducir» recorre el día (unos 30 s el día entero); «⏸ Pausa» lo detiene. Mover el deslizador también lo detiene.
4. Mientras rebobinas no hay avioneta, sonido ni avisos, y abrir, crear o eliminar sesiones avisa de que estás viendo el pasado. Abrir el panel de un piso amarillo no lo marca como revisado.
5. «Volver al directo» (o «Rebobinar» otra vez) devuelve la ciudad en vivo con todas sus sesiones.
6. Seguridad: `curl -s -o /dev/null -w '%{http_code}' -H 'Origin: http://evil.example' '127.0.0.1:4317/history?day=AAAA-MM-DD'` responde 403; un día futuro o mal escrito, 400.
7. En la demo (`?demo=`) rebobinar no está disponible y lo dice.

## 29. Instalación limpia y otros sistemas (2026-10-24)

1. Clon limpio: copia el repo a otra carpeta sin `node_modules` ni `data`, y ejecuta `npm install` y `./init.sh`; todo debe pasar. Arranca el colector con carpetas vacías (`COLLECTOR_PORT=4399 CIUDAD_DATA_DIR=… CIUDAD_TRANSCRIPTS_DIR=<vacía> CIUDAD_CODEX_DIR=<vacía>`) y el front con `VITE_COLLECTOR_WS=ws://127.0.0.1:4399/ws` (y `CIUDAD_WEB_PORTS` con su puerto): ciudad vacía, «Aún no hay sesiones», sin errores. Un evento enviado con `CIUDAD_PORT=4399 packages/collector/hook/send.sh` crea su edificio.
2. Instalador de hooks sin tocar el tuyo: `CLAUDE_SETTINGS_PATH=<carpeta temporal>/settings.json npm run hooks:install` crea el archivo con los 10 hooks y la statusline; `hooks:uninstall` los quita.
3. Hooks en Node (los de Windows): `echo '{"hook_event_name":"Notification","session_id":"x"}' | node packages/collector/hook/send.mjs` sale con 0 y el colector recibe el evento; con el colector apagado sale en menos de 1 s.
4. macOS sin cambios: `npm run autostart:status` dice «launchd: cargado» y el colector responde.
5. Linux (pendiente de probar en una máquina real): `npm run autostart:install` crea `~/.config/systemd/user/ciudad-de-agentes.service`; eliminar una sesión la deja en la papelera del escritorio, restaurable; abrir una sesión usa `xdg-open` o la primera terminal disponible.
6. Windows (pendiente de probar en una máquina real): `npm run hooks:install` usa `node "…send.mjs"`; `npm run autostart:install` deja `ciudad-de-agentes.vbs` en la carpeta Inicio; eliminar una sesión la manda a la Papelera de reciclaje.

## 30. Codex: contexto y Rebobinar sin hooks (2026-10-24)

1. Con el colector reiniciado, `curl -s 127.0.0.1:4317/sessions` muestra `contextPercent` en las sesiones de Codex (entrada de la última petición sobre `model_context_window`).
2. Entra en un edificio de Codex: cada piso lleva la barra de contexto bajo la placa (gris, ámbar desde el 70 %, naranja desde el 85 %), también si la sesión es de la app de escritorio de Codex.
3. Rebobinar «Hoy» o «Ayer»: los edificios de Codex aparecen y echan humo en las horas en que tuvieron turnos.

## Desinstalar todo

- Codex: `npm run hooks:uninstall:codex`.

```bash
npm run autostart:uninstall && npm run hooks:uninstall
```


## 29. Capturas del README (2026-10-24)

1. Abre `http://localhost:5173/?demo=24&projects=4`: aparecen los proyectos ficticios Tienda online, App del clima, Blog de recetas y Juego de ajedrez en ambos barrios. Guarda el mapa en `docs/capturas/mapa.png`.
2. En «Ir a un proyecto…», elige «Claude · Tienda online»: guarda la fachada con tres pisos, ayudantes y contexto en `docs/capturas/fachada.png`.
3. Elige «Claude · Blog de recetas» y abre «Revisión de cambios 1»: el panel muestra el proyecto ficticio, tokens, subagentes, contexto al 91 % y avería por límite de uso. Guarda `docs/capturas/panel.png`.
4. Abre `README.md`: las tres imágenes deben cargar y corresponder a esos proyectos, sin nombres ni rutas reales.

Resultado: capturas renovadas y revisadas visualmente; consola del navegador sin errores.

## Afueras de la ciudad (2026-10-25)

1. `npm run dev` y abre localhost:5173.
2. Aleja con la rueda y arrastra fuera del recuadro de barrios.
3. Esperado: alrededor del plano hay una ciudad 2.5D (misma perspectiva que los edificios de los barrios): adosados de ladrillo con tejado de pizarra, casas encaladas con teja, bloques de pisos de varias alturas, plazas con fuente, parques, árboles y farolas, con calles de manzanas de tamaño variable. Las dos avenidas cruzan el paseo y siguen por fuera con el mismo color y marcas discontinuas; las calles solo llevan marcas entre cruces. Una bruma clara la difumina con la distancia y el borde se funde con el fondo sin corte. Es decorativo, fijo entre recargas y no responde a datos.

## Captura del mapa en el README (2026-10-26)

1. Abre `http://localhost:5173/?demo=24&projects=4&urgentMs=0` sin tocar el zoom.
2. Esperado: los dos barrios con Tienda online, App del clima, Blog de recetas y Juego de ajedrez, y las afueras arriba y abajo. Es la imagen `docs/capturas/mapa-demo-20261026.png` del README; la fachada y el panel no cambian.
