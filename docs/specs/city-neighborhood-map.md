# Ciudad por barrios, vida ambiental y puentes

## Contrato de la feature

- Id: `city-neighborhood-map`.
- Inicio: 2026-10-19, implementación visual priorizada expresamente por el autor.
- Dependencias: render, cámara, buscador y panel de sesiones existentes (accepted). Reutiliza `project-buildings`, que sigue passing y no se marca como aceptada por este trabajo.
- Se adelanta la vista visual a la recogida real de Codex. El barrio Codex existe vacío hasta recibir sesiones de ese origen.

## Resultado esperado

La app abre un mapa superior 2.5D con calles, solares, árboles y barrios Claude/Codex. Cada pareja proyecto/proveedor tiene su edificio. Seleccionarlo muestra la fachada con sesiones por pisos y permite abrir el panel existente. Volver recupera la cámara del mapa.

El mapa tiene movimiento discreto y puentes que representan relaciones verificables o explícitas, sin sugerir que se envían mensajes entre sesiones.

## Alcance

- Reutilizar PixiJS, TypeScript, WebSocket, contadores, búsqueda, urgentes y panel existentes.
- Añadir `Session.agent?: claude|codex` como contrato compatible; ausente equivale a Claude. No implementar hooks ni lectura de transcripts de Codex aquí.
- Agrupar por `(provider, project.id)`, conservando identidad de repositorios y worktrees.
- Solares estables por proveedor, almacenados localmente; ampliar manzanas hacia abajo sin mover solares existentes.
- Mapa con arrastre, rueda/controles de zoom, accesos por barrio y selector accesible de proyectos.
- Fachada con azotea, lateral e interiores; selector de sesiones, panel y regreso al mapa.
- Puentes automáticos entre los edificios del mismo proyecto en Claude y Codex.
- Relaciones manuales entre proyectos diferentes, simétricas y sin duplicados; crear/quitar desde un panel local.
- Coches ambientales y pequeños personajes, actividad en las pantallas y señales de atención; control «Vida» y respeto a `prefers-reduced-motion`.
- La pestaña oculta detiene el ticker, sin detener los temporizadores de estados/avisos.

## Fuera de alcance

- Recoger datos de Codex, enviar mensajes, inferir relaciones leyendo conversaciones, sincronizar relaciones entre dispositivos o usuarios, backend de relaciones, Three.js y física 3D.
- Reinterpretar los estados, precios o métricas del colector.
- Instalar dependencias, sustituir el comando estándar de verificación o cambiar los hooks.

## Reglas de relación

1. Mismo `project.id` en proveedores diferentes: puente automático de tipo `same-project`.
2. Coincidir solo en nombre no crea relación. Los clones homónimos siguen separados.
3. El usuario puede relacionar dos `project.id` distintos; no puede relacionar un proyecto consigo mismo ni duplicar el vínculo invirtiendo sus extremos.
4. Si ambos proyectos tienen edificios en varios proveedores comunes, se dibuja una pasarela por proveedor común. Si no comparten proveedor, se conecta un extremo de cada barrio.
5. Si falta un extremo activo, no se dibuja la pasarela. La relación manual se conserva para cuando vuelvan las sesiones.
6. La animación sobre el puente es ambiental y se activa cuando hay trabajo en alguno de sus extremos; no representa un envío real.

## Datos y privacidad

- Sin endpoints nuevos ni lecturas adicionales de archivos privados.
- Solares, relaciones y preferencia de movimiento en `localStorage`, clave `ciudad.neighborhoods.v1`.
- El modo demo usa un espacio separado `.demo` para no contaminar los proyectos reales.
- Datos guardados validados al leer: versión, tipos, límites, deduplicación y rechazo de autoenlaces.
- Almacenamiento corrupto, bloqueado o lleno: la app funciona en memoria y avisa si no puede guardar una relación creada por el usuario.
- Nombres, rutas y títulos pasan por `textContent`, opciones nativas o Text de Pixi; nunca como HTML.

## Escenarios de aceptación

1. Dos sesiones del mismo repo en Claude y una en Codex producen dos edificios, con 2 y 1 pisos respectivamente.
2. Las sesiones de un colector antiguo sin `agent` siguen apareciendo en Claude; el barrio Codex no inventa edificios ni métricas.
3. Los clones homónimos se distinguen. Un worktree conserva su identidad de proyecto.
4. Al cerrar un edificio y añadir otro no se reordenan los solares existentes; ampliar filas no cambia sus coordenadas.
5. Arrastrar o acercar, entrar en un edificio y volver conserva posición y zoom del mapa. Un arrastre no abre un edificio ni activa la pancarta.
6. Buscar por proyecto, sesión o proveedor encuentra el piso y abre su fachada. El selector de proyectos y el selector de pisos funcionan con teclado.
7. Lo urgente y el clic del aviso revelan la sesión correcta entre barrios; se mantienen el panel y la revisión de amarillos al abrir.
8. Se dibuja el puente automático por id, no por nombre. Crear una relación manual, recargar y volver a abrir Puentes conserva el vínculo. Quitarla elimina solo el vínculo explícito.
9. «Vida: no» deja la escena quieta. Movimiento reducido congela animación ambiental, brillo variable y avioneta. Las señales y controles siguen disponibles.
10. Mapa vacío, varios proyectos, edificio alto y ventanas estrechas permiten acceder a edificios y sesiones sin tapar los controles principales.

## Investigación y estructura

- `shared/src/index.ts`: contrato compatible de proveedor.
- `web/src/world/model.ts`: agrupación, solares, disposición, puentes, recorridos y selección geométrica.
- `web/src/world/camera.ts`: ajuste de ciudad/barrio, límites, zoom hacia cursor y coordenadas inversas.
- `web/src/world/preferences.ts`: persistencia y validación local.
- `web/src/world/MapView.ts`: escena Pixi estática y sprites móviles separados.
- `web/src/world/WorldUI.ts`: controles HTML, nombres de edificios y panel de relaciones.
- `web/src/main.ts`: navegación mapa/fachada, cámaras separadas, búsqueda, urgentes, modo demo y conexión real.
- `web/src/tower/TowerView.ts`: fachada con volumen e interiores, reutilizando disposición y estados.
- `web/src/urgent/PlaneView.ts`: soporte de pancarta estática con movimiento reducido.
- `web/index.html`, `hud/StatusBar.ts`, `hud/search.ts`: controles y adaptación al nuevo recorrido.

## Verificación

- `./init.sh`: typecheck y suite completa, sin cambiar su comportamiento.
- Nuevos tests en `web/test/world.test.ts`: separación por proveedor y proyecto, compatibilidad, clones, estabilidad, vacío, puentes automáticos/manuales, desaparición de extremos, recorridos, cámara, zoom y persistencia corrupta/bloqueada.
- Navegador con `?demo=24&projects=4`: 8 edificios y 4 puentes automáticos; crear relación entre dos proyectos compartidos genera otras dos pasarelas y sobrevive a recarga; quitarla no borra las automáticas.
- Medir coordenadas DOM de un rótulo tras arrastre/zoom, entrar y volver: misma posición y anchura.
- Abrir un piso desde selector y con clic; comprobar modelo, métricas, estado y proyecto en panel.
- Probar búsqueda, ciudad/barrio, mapa vacío, edificio alto, movimiento detenido y navegador sin errores.
- Con el colector real, comparar recuento por proveedor/proyecto con `/sessions` y comprobar barrio Codex vacío mientras no esté integrado.
- No existe harness E2E: funciones puras, suite existente y prueba real en navegador cubren el contrato sin nueva infraestructura.

## Documentación y cierre

Actualizar DESIGN, CONTEXT, modelo de dominio, arquitectura, discovery técnico, guía manual, feature_list y PROGRESS. Guardar capturas de la implementación sin datos reales en `docs/design/evidence/`.

La implementación queda passing tras verificación, pendiente validación independiente. Los estados de `project-buildings`, `codex-event-probe` y `codex-sessions` se conservan; la existencia de su barrio no implica integración real de Codex.
