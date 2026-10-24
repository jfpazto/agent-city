# Instrucciones para agentes

Este repositorio contiene la «Ciudad de agentes»: una app web local (Vite + TypeScript + PixiJS y un colector en Node) que muestra una ciudad 2.5D por barrios de proveedor: cada proyecto/agente es un edificio y cada sesión uno de sus pisos, con estado y métricas en vivo. Los datos reales proceden de Claude Code (hooks, statusline y transcripts) y de Codex (sondeo de rollouts, sin hooks todavía).

## Leer primero

- `CONTEXT.md`: vocabulario del dominio (sesión, piso, colector…).
- `docs/build-brief.md`: objetivos y MVP.
- `docs/domain-model.md`: entidades y máquina de estados.
- `docs/risks-and-open-questions.md`: riesgos y preguntas abiertas.

Según lo que toques:

- `docs/technical-discovery.md`: si tocas el stack, los hooks, los transcripts, los datos o el arranque.
- `DESIGN.md`: si tocas cualquier elemento visual.

## Al empezar

1. Confirma el directorio con `pwd`.
2. Lee `PROGRESS.md`.
3. En `feature_list.json`, elige la primera feature sin terminar cuyas dependencias (`depends_on`) estén todas en `accepted`.
4. Ejecuta `./init.sh` (instala si hace falta y pasa el typecheck y los tests; no arranca servidores).
5. Si falla la verificación base, arréglala antes de empezar la feature.
6. Para ver la app, ejecuta `npm run dev`: colector en 127.0.0.1:4317 y front en localhost:5173. La estructura está en `ARCHITECTURE.md`. Los hooks se instalan con `npm run hooks:install` y se quitan con `npm run hooks:uninstall`.

## Reglas de trabajo

- Una feature a la vez.
- Una feature no está hecha solo porque haya código.
- No te salgas del alcance de la feature, salvo un arreglo mínimo que la desbloquee.
- No cambies las reglas de verificación sin avisar.
- Los hooks nunca deben bloquear Claude Code: timeout corto y salida siempre con código 0.
- Ningún dato de los transcripts sale de la máquina; el colector solo escucha en `127.0.0.1`.
- Los fixtures de test van anonimizados.
- Guarda el estado en los archivos del repo, no en resúmenes del chat.
- Si una feature cambia algo visible o cómo se arranca o prueba la app, actualiza `docs/pruebas-manuales.md` (pasos, resultado esperado y fecha) en la misma feature.

## Archivos obligatorios

- `feature_list.json`: fuente de verdad del estado de cada feature.
- `PROGRESS.md`: estado verificado y registro de sesiones.
- `init.sh`: arranque y verificación estándar.

## Cuándo está hecha una feature

- `docs/pruebas-manuales.md` refleja el comportamiento actual.

- El comportamiento está implementado.
- La verificación se ejecutó de verdad.
- La evidencia está anotada en `feature_list.json` o en `PROGRESS.md`.
- El repo vuelve a arrancar con `./init.sh`.
- Los documentos están actualizados si cambió el comportamiento, el dominio o la verificación.

## Al terminar la sesión

Actualiza `PROGRESS.md` y `feature_list.json`, anota los bloqueos y deja el repo listo para que la siguiente sesión ejecute `./init.sh`.
