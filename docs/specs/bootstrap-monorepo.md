# Spec de implementación: Esqueleto del repo con colector y front arrancables

## Feature de origen

- `id`: bootstrap-monorepo
- `area`: infra
- `depends_on`: ninguna
- `status`: not_started
- `source`: `feature_list.json`

## Objetivo

Dejar el repo con un monorepo npm mínimo que arranca con un solo comando: un colector en Node (TypeScript) que responde a `/health` en `127.0.0.1` y un front con Vite + TypeScript que monta un canvas de PixiJS. Además, una verificación base (`typecheck` + tests) que `./init.sh` ejecuta sin arrancar servidores. Es la base sobre la que se construyen todas las demás features.

## Fuera de alcance

- Recibir hooks (`/hook`), la máquina de estados, el WebSocket o leer transcripts: son features posteriores.
- Dibujar la torre, los pisos o cualquier elemento de DESIGN.md más allá de un fondo de cielo.
- Lint, formateo, CI, Docker, `launchd` o empaquetado.
- Tocar `~/.claude/settings.json`.

## Historia de trabajo

Cuando empiece a construir la Ciudad de agentes,
quiero un repo que instala, verifica y arranca con comandos estándar,
para que cada feature siguiente solo añada comportamiento y no infraestructura.

## Usuarios y permisos

- El autor (único usuario, en local). Sin autenticación. El colector escucha solo en `127.0.0.1`.

## Escenarios de aceptación

### Escenario 1: arranque en desarrollo
Dado un clon limpio con Node ≥ 20
cuando ejecuto `npm install` y luego `npm run dev`
entonces el colector registra que escucha en `http://127.0.0.1:4317` y Vite sirve el front en `http://localhost:5173`.

### Escenario 2: health del colector
Dado el colector arrancado
cuando hago `curl -s 127.0.0.1:4317/health`
entonces recibo un 200 con `{"ok":true,"service":"collector"}`.

### Escenario 3: canvas de PixiJS
Dado el front abierto en el navegador
cuando carga la página
entonces se ve un canvas de PixiJS a pantalla completa con el color `sky` de DESIGN.md, el título «Ciudad de agentes» en la pestaña y ningún error en la consola.

### Escenario 4: verificación base
Dado el repo instalado
cuando ejecuto `./init.sh`
entonces instala si hace falta, pasa `npm run typecheck` y `npm test`, imprime cómo arrancar y termina con código 0 sin dejar procesos vivos.

### Escenario 5: ruta desconocida
Dado el colector arrancado
cuando pido `GET /nope`
entonces responde 404 en JSON y el proceso sigue vivo.

## Investigación del repositorio

### Archivos revisados
- `AGENTS.md`, `PROGRESS.md`, `feature_list.json`: flujo de trabajo y estado.
- `docs/technical-discovery.md`: stack (Vite + TS + PixiJS, colector en Node), solo `127.0.0.1`.
- `DESIGN.md`: color `sky` `#7FB2E5` y escalado `nearest`.
- `init.sh`: variante pre-bootstrap, hay que reemplazarla.

### Patrones existentes
Ninguno: el repo no tiene código. En la máquina están Node v26.12.0 y npm 11.20.0.

### Lo que falta
No existe `package.json`, ni git, ni dependencias.

## Enfoque técnico

- **npm workspaces** con tres paquetes:
  - `packages/shared`: tipos compartidos (por ahora, `HealthResponse`), en TypeScript sin compilar, consumido por ruta.
  - `packages/collector`: servidor `node:http` sin framework, ejecutado con `tsx`. Exporta `createServer()` para poder testearlo sin abrir puertos fijos; `src/main.ts` lo arranca en el puerto `COLLECTOR_PORT` (4317 por defecto), en el host `127.0.0.1`.
  - `packages/web`: Vite + TypeScript + `pixi.js` v8. `src/main.ts` crea una `Application` con `resizeTo: window`, fondo `#7FB2E5`, `roundPixels: true` y textura por defecto con escalado `nearest`.
- **Tests**: `vitest` en la raíz. El test del colector arranca `createServer()` en el puerto 0, pide `/health` y `/nope` con `fetch` y lo cierra.
- **Scripts de la raíz**:
  - `dev`: `concurrently` con el colector (`tsx watch`) y el front (`vite`).
  - `typecheck`: `tsc -b` o `tsc --noEmit` por paquete.
  - `test`: `vitest run`.
- **`init.sh`**: variante con bootstrap. Ejecuta `npm install` si falta `node_modules`, luego `npm run typecheck` y `npm test`, e imprime `npm run dev`. Nunca arranca servidores.
- `tsconfig.base.json` con `strict: true`, `module: "ESNext"` y `moduleResolution: "Bundler"`.
- `.gitignore` con `node_modules`, `dist` y `*.log`.

## Archivos previstos

- `package.json`: crear; workspaces, scripts y devDeps (`typescript`, `vitest`, `tsx`, `concurrently`).
- `tsconfig.base.json`: crear.
- `.gitignore`: crear.
- `packages/shared/package.json`, `packages/shared/src/index.ts`: crear.
- `packages/collector/package.json`, `tsconfig.json`, `src/server.ts`, `src/main.ts`, `test/health.test.ts`: crear.
- `packages/web/package.json`, `tsconfig.json`, `index.html`, `vite.config.ts`, `src/main.ts`: crear.
- `init.sh`: modificar (variante con bootstrap).
- `PROGRESS.md`, `feature_list.json`: actualizar el estado y la evidencia.

## Impacto visual

- Hay interfaz: sí, mínima.
- Fuente: `DESIGN.md` (color `sky` y escalado `nearest`).
- Pantallas: solo el canvas vacío.
- Hace falta un artefacto de diseño nuevo: no.

## Impacto en la documentación

- `ARCHITECTURE.md`: crear, breve (menos de 30 líneas). Esta feature fija los paquetes (shared, collector y web), la dirección de las dependencias (web y collector → shared; nunca web → collector salvo por red) y los puertos.
- `CONSTRAINTS.md`: no hace falta; las reglas duras ya están en `AGENTS.md`.
- `AGENTS.md`: actualizar la sección «Al empezar» con los comandos reales (`./init.sh`, `npm run dev`).
- `docs/technical-discovery.md`: actualizar «Despliegue y operación» con los puertos 4317 y 5173.

## Plan de implementación

1. Crear la raíz del monorepo (`package.json`, tsconfig y `.gitignore`) e instalar las devDependencies.
2. Crear `shared` y `collector` con `/health`, el 404 y su test.
3. Crear `web` con Vite y PixiJS.
4. Conectar los scripts `dev`, `typecheck` y `test`.
5. Reescribir `init.sh` y comprobar los cinco escenarios.
6. Escribir `ARCHITECTURE.md`, actualizar los docs y anotar la evidencia.

## Tareas

- [ ] `package.json` raíz con `"workspaces": ["packages/*"]`, `"type": "module"` y `"private": true`.
- [ ] `tsconfig.base.json` en modo estricto.
- [ ] `packages/shared/src/index.ts` con `export type HealthResponse = { ok: true; service: "collector" }`.
- [ ] `packages/collector/src/server.ts` con `createServer()`: `/health` → 200 JSON; el resto → 404 JSON.
- [ ] `packages/collector/src/main.ts` que escucha en `127.0.0.1:${COLLECTOR_PORT ?? 4317}` y muestra un log de arranque.
- [ ] `packages/collector/test/health.test.ts` con los escenarios 2 y 5.
- [ ] `packages/web`: `index.html` con el título «Ciudad de agentes» y `src/main.ts` con la `Application` de Pixi.
- [ ] Scripts `dev`, `typecheck` y `test` en la raíz.
- [ ] `init.sh` con bootstrap y `chmod +x`.
- [ ] `ARCHITECTURE.md`, `AGENTS.md` y `docs/technical-discovery.md` actualizados.
- [ ] `feature_list.json` en `passing` con la evidencia y `PROGRESS.md` con la sesión 002.

## Plan de verificación

- `./init.sh` → código 0; la salida muestra los tests pasados y termina sin procesos vivos (comprobar con `lsof -i :4317` después).
- `npm run dev` en segundo plano, luego `curl -s 127.0.0.1:4317/health` → `{"ok":true,"service":"collector"}`.
- `curl -s -o /dev/null -w '%{http_code}' 127.0.0.1:4317/nope` → `404`.
- `lsof -iTCP:4317 -sTCP:LISTEN` → solo `127.0.0.1`, no `*`.
- Abrir `http://localhost:5173` en el navegador de la app: canvas azul cielo y consola sin errores (captura de pantalla).
- E2E: no existe un harness E2E y esta feature no tiene flujo de usuario; basta con el test de integración del colector y la comprobación manual del canvas.

## Evidencia a guardar

- Salida resumida de `./init.sh` (tests pasados).
- Respuestas de `curl` de `/health` y `/nope`.
- Línea de `lsof` mostrando `127.0.0.1:4317`.
- Captura del canvas y resultado de la consola.

## Checklist del validador

- [ ] El trabajo no se sale del alcance (sin `/hook`, sin WebSocket, sin torre).
- [ ] Los escenarios 1–5 pasan.
- [ ] El colector no escucha en `0.0.0.0`.
- [ ] `./init.sh` no arranca servidores y termina con código 0.
- [ ] La evidencia está registrada en `feature_list.json` y `PROGRESS.md`.
- [ ] `ARCHITECTURE.md` existe y coincide con la estructura real.
- [ ] No se añadieron dependencias fuera de las listadas (pixi.js, vite, typescript, vitest, tsx, concurrently).
