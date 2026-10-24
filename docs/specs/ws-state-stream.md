# Spec de implementación: envío del estado en vivo por WebSocket

## Feature de origen

- `id`: ws-state-stream
- `area`: colector
- `depends_on`: session-state-machine (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Objetivo

Que el front reciba el estado de todas las sesiones al conectarse y cada cambio en vivo (en menos de 2 s desde el evento de hook), y que se reconecte solo si el colector se reinicia. Es el canal sobre el que se pintará la torre (`tower-render-floors`) y los contadores.

## Fuera de alcance

- Pintar la torre, los pisos o los colores (`tower-render-floors`, `floor-state-colors`). El front solo mantiene el estado en memoria y lo muestra en un texto de depuración.
- Mensajes del front al colector (marcar como revisado, responder…).
- Métricas de transcript, reloj de inactividad y persistencia.
- Autenticación (el colector es local), salvo el control de `Origin` descrito abajo.

## Historia de trabajo

Cuando tengo la Ciudad abierta en el navegador,
quiero que el estado de mis sesiones llegue solo y al momento,
para no tener que recargar ni consultar nada a mano.

## Usuarios y permisos

- El autor, en local.
- Riesgo a cubrir: cualquier página web abierta en el navegador puede intentar abrir un WebSocket a `127.0.0.1:4317`. El bind local no lo impide, y el estado contiene `cwd`, títulos y mensajes. Por eso el servidor **rechaza los upgrades cuyo `Origin` no sea local** (`http://localhost:<puerto>` o `http://127.0.0.1:<puerto>`). Los clientes sin `Origin` (tests, `node`) se aceptan.

## Protocolo (contrato)

Ruta: `ws://127.0.0.1:4317/ws`. Mensajes JSON del servidor al cliente, tipados en `@ciudad/shared`:

```ts
type ServerMessage =
  | { type: "snapshot"; sessions: Session[] }     // al conectar
  | { type: "session"; session: Session }         // alta o cambio de una sesión
  | { type: "removed"; id: string };              // SessionEnd
```

- Al conectarse, el cliente recibe primero un `snapshot` con `store.list()`.
- Después de cada `store.apply` que cambia algo, todos los clientes reciben `session` o `removed`.
- Si el evento se ignoró (`reduce` devuelve `undefined`), no se envía nada.
- Los mensajes del cliente se ignoran.

## Escenarios de aceptación

### Escenario 1: snapshot al conectar
Dado el colector con dos sesiones conocidas
cuando un cliente se conecta a `/ws`
entonces su primer mensaje es un `snapshot` con las dos sesiones, ordenadas por planta.

### Escenario 2: cambio en vivo
Dado un cliente conectado
cuando llega `POST /hook` con un `PermissionRequest` de una sesión
entonces el cliente recibe `{type:"session"}` con `state: "te_necesita"` en menos de 2 s (en el test, en menos de 500 ms).

### Escenario 3: sesión retirada
Dado un cliente conectado y una sesión existente
cuando llega `SessionEnd`
entonces el cliente recibe `{type:"removed", id}`.

### Escenario 4: evento ignorado
Dado un cliente conectado
cuando llega un evento sin `session_id`
entonces el cliente no recibe ningún mensaje.

### Escenario 5: origen no permitido
Dado el colector arrancado
cuando un cliente intenta conectarse con `Origin: https://evil.example`
entonces el upgrade se rechaza (403) y no se envía estado.

### Escenario 6: reconexión del front
Dado el front abierto en `localhost:5173` y conectado
cuando paro y vuelvo a arrancar el colector
entonces el front se reconecta solo (reintentos con espera creciente: 0,5 s, 1 s, 2 s… hasta un máximo de 5 s) y vuelve a recibir un `snapshot`.

### Escenario 7: el front refleja una sesión real
Dado el front abierto
cuando una sesión real de la app pide permiso
entonces el texto de depuración del front muestra esa sesión como `te_necesita` sin recargar.

## Investigación del repositorio

### Archivos revisados
- `packages/collector/src/sessions.ts`: `createSessionStore` con `apply`, `list` y `get`. No avisa de cambios; hace falta un mecanismo de suscripción.
- `packages/collector/src/server.ts`: `createServer({ eventsDir, store })` devuelve un `http.Server`; `/hook` llama a `store.apply`. El upgrade de WebSocket se engancha a este mismo servidor.
- `packages/shared/src/index.ts`: tipos `Session` y `SessionState`.
- `packages/web/src/main.ts`: solo crea la `Application` de Pixi.
- `packages/web/vite.config.ts`: puerto 5173, sin proxy.
- `ARCHITECTURE.md`: el front y el colector solo se hablan por red; el colector solo en 127.0.0.1.

### Lo que falta
- No hay dependencia de WebSocket. Se usará `ws` en el colector (estándar y sin dependencias). El front usa el `WebSocket` nativo del navegador.

## Enfoque técnico

- **Store** (`sessions.ts`): añadir `subscribe(listener): () => void`. `apply` notifica `{type:"session", session}` (con `expose`) o `{type:"removed", id}` solo cuando `reduce` devuelve algo distinto de `undefined`. Los listeners se llaman de forma síncrona dentro de `apply` y cualquier error se captura por listener.
- **Hub WS** (`collector/src/wsHub.ts`): `attachWsHub(server, store, { allowedOrigins? })`:
  - `new WebSocketServer({ noServer: true })`.
  - En `server.on("upgrade")`: si `url !== "/ws"` → destruir el socket. Si hay `Origin` y no es local → responder `HTTP/1.1 403` y destruir. Si no, `handleUpgrade`.
  - Al conectar: enviar el `snapshot`.
  - `store.subscribe` reenvía el mensaje a todos los clientes con `readyState === OPEN`.
  - Devuelve `close()` para los tests.
- `createServer` llama a `attachWsHub` (opción `ws: false` para desactivarlo si algún test lo necesita).
- **Tipos**: `ServerMessage` en `@ciudad/shared`.
- **Front** (`web/src/stateClient.ts`): `connectState(url, onChange)`.
  - Mantiene `Map<id, Session>`: aplica `snapshot`, `session` y `removed`, y llama a `onChange(sessions ordenadas)`.
  - Reconecta con backoff (0,5 s → ×2 → máximo 5 s; se reinicia al conectar).
  - URL: `ws://127.0.0.1:4317/ws` (configurable con `import.meta.env.VITE_COLLECTOR_WS`).
- **Front** (`main.ts`): muestra un texto de depuración de Pixi (`Text`, fuente monoespaciada) arriba a la izquierda, con una línea por sesión (`planta · id corto · estado`) y el estado de la conexión. Es provisional: lo sustituirá `tower-render-floors`.

## Archivos previstos

- `packages/collector/package.json`: añadir `ws` y `@types/ws` (dev).
- `packages/collector/src/sessions.ts`: modificar; añadir `subscribe`.
- `packages/collector/src/wsHub.ts`: crear.
- `packages/collector/src/server.ts`: modificar; enganchar el hub.
- `packages/shared/src/index.ts`: añadir `ServerMessage`.
- `packages/collector/test/ws.test.ts`: crear; escenarios 1 a 5 con el cliente de `ws` en el puerto 0.
- `packages/collector/test/sessions.test.ts`: añadir un test de `subscribe` (notifica cambios y retiradas, no notifica eventos ignorados).
- `packages/web/src/stateClient.ts`: crear.
- `packages/web/src/main.ts`: modificar; texto de depuración.
- `ARCHITECTURE.md`, `feature_list.json`, `PROGRESS.md`: actualizar.

## Impacto visual

- Hay interfaz: mínima y provisional (texto de depuración).
- Fuente: `DESIGN.md`, solo la tipografía monoespaciada y el color `panelText` sobre el cielo. No hace falta un artefacto nuevo.

## Impacto en la documentación

- `ARCHITECTURE.md`: actualizar con el protocolo WS (`/ws`, los tres mensajes) y la regla de `Origin`.
- `CONSTRAINTS.md`: no hace falta; la regla de `Origin` cabe en `ARCHITECTURE.md` (sección Reglas).
- `AGENTS.md`: no hace falta.
- `docs/technical-discovery.md`: no hace falta (el WebSocket ya figuraba en el stack).

## Plan de implementación

1. Tipos en `shared` y `subscribe` en el store, con su test.
2. `wsHub.ts` enganchado a `createServer`, con los tests de los escenarios 1 a 5.
3. `stateClient.ts` y el texto de depuración en el front.
4. Prueba manual de reconexión y con una sesión real.
5. Docs, evidencia y commit.

## Tareas

- [ ] `npm i -w @ciudad/collector ws` y `npm i -D -w @ciudad/collector @types/ws`.
- [ ] `ServerMessage` en `shared`.
- [ ] `subscribe` en el store, que solo notifica cambios reales.
- [ ] `attachWsHub`: ruta `/ws`, filtro de `Origin`, `snapshot` y broadcast.
- [ ] `createServer` engancha el hub.
- [ ] Tests WS (incluido el 403) y test de `subscribe`.
- [ ] `stateClient.ts` con reconexión y backoff.
- [ ] Texto de depuración en `main.ts`.
- [ ] `ARCHITECTURE.md`.
- [ ] Evidencia y commit.

## Plan de verificación

- `./init.sh` → typecheck y todos los tests en verde.
- Reiniciar el colector persistente (`npx tsx packages/collector/src/main.ts` en segundo plano) y arrancar Vite (`npm run dev -w @ciudad/web`).
- Abrir `http://localhost:5173` en el navegador de la app: el texto lista las sesiones vivas y la consola no muestra errores.
- Escenario 6: matar el colector; el texto pasa a «desconectado». Volver a arrancarlo; en menos de 5 s vuelve a «conectado» con un snapshot.
- Escenario 7: una sesión real en modo «Pedir permiso» se ve como `te_necesita` sin recargar.
- `curl -i -H "Connection: Upgrade" -H "Upgrade: websocket" -H "Sec-WebSocket-Version: 13" -H "Sec-WebSocket-Key: dGVzdA==" -H "Origin: https://evil.example" 127.0.0.1:4317/ws` → `403`.
- E2E: no hay harness. Bastan los tests WS de integración y la comprobación manual en el navegador (escenarios 6 y 7).

## Evidencia a guardar

- Salida de `./init.sh`.
- Captura o texto del front con las sesiones y el estado de la conexión.
- Tiempo aproximado de reconexión.
- Respuesta 403 del `curl` con un origen ajeno.

## Checklist del validador

- [ ] El primer mensaje es siempre un `snapshot`.
- [ ] Solo se envían mensajes cuando el estado cambia de verdad.
- [ ] Los orígenes ajenos se rechazan y los locales se aceptan.
- [ ] El front se reconecta solo con backoff acotado.
- [ ] `/hook` sigue respondiendo 204 aunque falle un listener.
- [ ] No se pintó la torre ni se añadieron mensajes del cliente al servidor.
- [ ] El protocolo está documentado en `ARCHITECTURE.md`.
