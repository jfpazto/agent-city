# Edificios por proyecto/agente

## Feature

- Id: `project-buildings`.
- Origen: cambio solicitado por el autor el 2026-10-19.
- Depende de `tower-render-floors`, `tower-scroll-zoom`, `floor-search` y `detail-panel-metrics` (accepted).
- Vocabulario confirmado: ciudad → proyectos/agentes (edificios) → sesiones (pisos).

## Objetivo

Al mirar la ciudad, reconocer cada proyecto/agente como un edificio independiente y encontrar sus sesiones dentro de él, conservando estados, métricas, búsqueda y avisos.

## Alcance y límites

- Identificar proyectos mediante el repositorio Git; agrupar raíz, subcarpetas y worktrees.
- Un edificio por proyecto, rotulado en la azotea y al pie; una sesión por piso vertical.
- Resolver también carpetas sin Git y sesiones sin carpeta, sin descartarlas.
- Navegar por una ciudad más ancha que la ventana, encontrar sesiones y abrir sus paneles.
- Conservar posiciones mientras vive el colector; no se añade persistencia en disco.
- No implementar Codex, automatización entre agentes, métricas agregadas por proyecto, 3D ni decoración nueva.
- No cambiar instalación de hooks, precios, parser de métricas ni reglas de verificación.

## Contrato de datos

`Project`: `{ id, name, root?, order? }`. `Session` añade `project?` y `projectFloor?`.

- `project.id` deriva de la ruta canónica a los metadatos Git comunes. Dos clones homónimos son proyectos distintos.
- `project.order` es el solar asignado por el colector durante su vida; no depende del título ni de la sesión más antigua que siga abierta.
- `projectFloor` es la posición local de la sesión dentro del edificio. Se asigna el menor hueco libre y se mantiene con los cambios de estado y las reanudaciones.
- Si cambia el cwd a otro proyecto, se asigna un hueco libre del edificio de destino.
- `floor` global se mantiene para compatibilidad con consumidores anteriores.
- Sin Git: identidad por carpeta canónica. Sin carpeta absoluta: edificio «Sin proyecto».
- El arranque en frío y los hooks usan la misma resolución. `/sessions` y WS exponen los mismos metadatos.
- No se ejecuta Git ni se escriben sus metadatos; solo se leen `.git` y `commondir`. La resolución se cachea por cwd.

## Diseño

Fuente: `DESIGN.md`. Se conservan paleta, estados, iconos, bocadillos y píxel duro.

- Piso 240 × 96 px; marco 4 px; separación entre edificios 48 px.
- Una columna; al menos dos pisos y uno libre por encima del más alto ocupado.
- Rótulo de 32 px en la azotea, nombre también al pie. Nombres largos recortados; homónimos con número de solar.
- Suelo común y calle centrada si cabe. Los edificios ausentes dejan su solar reservado durante la conexión.
- Sin sesiones: no hay edificios ficticios; se muestra «Aún no hay proyectos».
- En ventanas de hasta 1100 px, buscador y avisos ocupan una segunda fila.

## Escenarios de aceptación

1. Dadas dos sesiones de un repositorio (una en un worktree externo) y una de otro, al recibir sus eventos aparecen dos edificios y las primeras comparten identidad con pisos distintos.
2. Dados dos repositorios con el mismo nombre, se ven edificios separados y se puede consultar la raíz en el panel.
3. Al cerrar la sesión del piso 0, queda un hueco libre y la sesión del piso 1 no baja. Una nueva sesión del mismo proyecto reutiliza el 0.
4. Tras cerrar la sesión más antigua de un edificio y recargar el front, los edificios no se intercambian y los pisos supervivientes conservan su índice local.
5. Al buscar un proyecto se recorren sus sesiones; buscar un título sigue funcionando. Se centra el piso aunque esté en otro edificio y el panel identifica el proyecto/agente.
6. Con varios edificios fuera de pantalla, arrastre, trackpad horizontal o Mayús + rueda permiten recorrerlos. La rueda vertical y el zoom siguen funcionando con límites del mundo completo.
7. Arrastrar no abre paneles ni activa la pancarta. Un clic en un piso abre su sesión; el clic de la pancarta sigue centrando el primer urgente.
8. Sin sesiones se ve el mensaje vacío. Un colector anterior sin `project` sigue siendo utilizable, agrupando por cwd.

## Investigación y archivos

- `collector/src/sessions.ts`: store, reducer puro, siembra y asignación global existentes.
- `collector/src/server.ts`: `/hook`, `/sessions`, arranque en frío y actualización de métricas.
- `shared/src/index.ts`: contrato de sesiones y mensajes WS.
- `web/src/main.ts`: integración del estado, cámara, buscador, panel y urgentes.
- `web/src/tower/layout.ts`, `TowerView.ts`, `camera.ts`: disposición anterior, dibujo y cámara.
- `web/src/hud/search.ts`, `StatusBar.ts` y `web/src/panel/`: búsqueda y detalle.

Nuevos módulos: `collector/src/projects.ts` y `web/src/tower/city.ts`. Pruebas nuevas en `collector/test/projects.test.ts` y `web/test/city.test.ts`.

## Verificación

- `./init.sh`: typecheck y suite completa; sin servidores persistentes ni cambios en el comando estándar.
- Tests de identidad: subcarpetas, worktree externo, enlace simbólico, homónimos, fallback y metadatos inválidos.
- Tests del store: pisos por proyecto, huecos, cambio de proyecto, reanudación, siembra y payload publicado.
- Tests de disposición: edificios, suelo común, huecos, vacío, compatibilidad y orden tras una recarga.
- Tests de navegación: búsqueda por proyecto y selección del piso con cámara desplazada y zoom.
- Navegador: demo vacía, varios edificios, arrastre horizontal, búsqueda y panel con sesiones reales; consola sin errores.
- Integración local: colector aparte con arranque en frío y eventos desde un checkout y un worktree reales. Retirar las sesiones de prueba al terminar.
- No hay harness E2E instalado: se combinan funciones puras, integración local y prueba visual; no se añade infraestructura.

## Documentación y evidencia

- Actualizar `CONTEXT.md` y `docs/domain-model.md` por el nuevo significado de agente/proyecto.
- Actualizar `DESIGN.md`, `ARCHITECTURE.md`, brief y discovery técnico.
- Actualizar descripción de `AGENTS.md`, guía `docs/pruebas-manuales.md`, `PROGRESS.md` y `feature_list.json`.
- Guardar una captura sin datos reales en `docs/design/evidence/project-buildings.png`.
- No hace falta un ADR: se mantiene el stack y la agrupación se puede cambiar.

## Límites conocidos

- El orden y los pisos se reconstruyen tras reiniciar el colector; no se promete la misma posición entre reinicios.
- La caché conserva la identidad por cwd durante la vida del store: inicializar o mover un repositorio requiere reiniciar el colector.
- El fallback de un colector antiguo no puede unificar worktrees hasta que se reinicie con la versión nueva.
- Los avisos reales del sistema siguen sujetos al permiso del navegador; su comprobación manual previa continúa pendiente.
