# Modelo de dominio

## Conceptos centrales
- **Proyecto / agente**: repositorio Git, con identidad local, nombre y raíz. Tiene un edificio propio y reúne las sesiones de sus subcarpetas y worktrees. Sin Git, la carpeta de trabajo sirve como proyecto; sin carpeta, la sesión aparece en «Sin proyecto».
- **Sesión**: `session_id`, `cwd`, título (derivado de la carpeta o del primer mensaje), modelo, ruta del transcript, estado, fecha de la última actividad y planta asignada.
- **Evento**: `session_id`, tipo de hook, fecha, herramienta (si la hay) y mensaje (en las notificaciones).
- **Métricas de sesión**: tokens (entrada, salida y caché), coste estimado, número de comandos (Bash), lecturas (Read/Grep/Glob), acciones web (WebFetch/WebSearch), archivos editados y consumo por día.
- **Entrada de bitácora**: fecha, tipo de acción y texto corto.

## Relaciones
- Una sesión tiene muchos eventos, una sola métrica agregada y una bitácora.
- Un proyecto/agente tiene un edificio y muchas sesiones. Una carpeta (`cwd`) puede tener varias sesiones.
- Cada sesión ocupa un piso dentro de su edificio; su posición local se asigna al aparecer y se mantiene mientras pertenezca al proyecto. Se conserva también el índice global anterior para compatibilidad.
- La identidad del repositorio usa sus metadatos Git comunes, no el nombre de la carpeta: dos repositorios homónimos tienen edificios distintos y los worktrees del mismo repositorio comparten edificio.
- El edificio aparece con su primera sesión y deja de mostrarse cuando se retira la última. Dormir una sesión no elimina su edificio.

## Ciudad por barrios (vista implementada; Codex por rollouts, sin hooks)

- El front admite un proveedor de origen (`Session.agent`: `claude` o `codex`), independiente del proyecto Git. Ausente en los datos anteriores significa Claude; las de Codex salen de sus rollouts.
- Cada barrio corresponde a un proveedor y contiene manzanas con solares para sus edificios.
- La representación de edificio se identifica por la pareja **proyecto + proveedor**. Un mismo proyecto puede tener dos edificios, uno en cada barrio; no son dos proyectos distintos ni comparten sus sesiones.
- Un piso representa una sesión de ese proyecto y proveedor. Los worktrees conservan la identidad Git dentro del barrio correspondiente.
- La navegación tiene cuatro niveles: ciudad → barrio → edificio → sesión. La vista superior permite recorrer la ciudad; al entrar se muestra la fachada frontal y el panel de la sesión.
- Regresar desde un edificio conserva la cámara del mapa. Cambiar al edificio del otro proveedor conserva el proyecto como referencia.
- La máquina de estados por sesión descrita abajo no cambia por esta organización visual.

## Relaciones entre proyectos y puentes

- Una relación manual une dos ids de proyecto distintos, sin orientación ni duplicados. Se crea o se elimina por acción del usuario y se guarda en su navegador.
- Un mismo proyecto presente en dos barrios produce un puente automático; coincidir solo en nombre no basta.
- Para una relación manual se dibuja un puente por proveedor común; si no hay proveedor común, se conectan los barrios.
- Sin sesiones en alguno de los extremos no se dibuja su puente, pero la relación manual queda guardada para cuando el proyecto reaparezca.
- El movimiento sobre el puente es ambiental y no implica colaboración, llamada o mensaje detectados. No se inspeccionan conversaciones para inferir vínculos.
- El solar de cada edificio sale de su última actividad: en cada barrio, el proyecto con el evento más reciente ocupa el primero. Un edificio se mueve cuando otro pasa a tener actividad más reciente; ampliar la ciudad añade filas.

## Estados y ciclo de vida
| Evento | Estado resultante | Efecto sobre `pending` (permisos pendientes) |
|---|---|---|
| `SessionStart` | crea la sesión en `dormida`; si ya existe (p. ej. `source: resume`), no cambia | — |
| `UserPromptSubmit` | `trabajando` | se vacía |
| `PreToolUse` | `te_necesita` si queda algo pendiente; si no, `trabajando` | si es una llamada nueva (otro `tool_use_id`) de una herramienta con permiso pendiente, ese pendiente (y el `tool:<nombre>` de esa herramienta) se da por resuelto (denegado) |
| `PermissionRequest` | `te_necesita` | añade el `tool_use_id` del último `PreToolUse` de esa herramienta (o `tool:<nombre>` si no hay) |
| `PostToolUse` / `PostToolUseFailure` | `te_necesita` si queda algo pendiente; si no, `trabajando` | quita solo el de su propia llamada (`tool_use_id`) |
| `Notification` `permission_prompt` | `te_necesita` solo si hay algo pendiente; si no, sin cambio | — |
| `Notification` de otro tipo | sin cambio (guarda el mensaje) | — |
| `Stop` | `para_revisar` | se vacía |
| `SubagentStop` | sin cambio (cuenta como actividad) | — |
| `SessionEnd` | se retira la sesión y libera su planta | — |
| sin reloj (feature `idle-timeout`) | cualquiera menos `te_necesita` → `dormida` tras 30 min | — |
| abrir el piso (feature `review-clears-on-open`) | `para_revisar` → `dormida` | — |

`te_necesita` nunca pasa sola a `dormida`: una petición pendiente sigue en rojo hasta que se atienda.

## Escenarios importantes
- **Petición de permiso**: llega `PermissionRequest` y el piso se pone rojo al instante, con lo que sube el contador «te necesitan». Al aprobar, llega el `PostToolUse` de esa llamada y el piso vuelve a verde.
- **Turno terminado**: llega un `Stop`, el piso se pone amarillo y queda «para revisar» hasta que lo abro.
- **Arranque en frío**: el colector arranca con sesiones ya abiertas; lee los transcripts recientes, crea los pisos en estado `dormida` y los actualiza con los siguientes eventos.

## Eventos reales observados (app de escritorio, 2026-10-19)
- Secuencia con permiso: `SessionStart` → `UserPromptSubmit` → `PreToolUse` → `PermissionRequest` (mismo instante) → `Notification` `permission_prompt` (unos 6 s después; no llega si se aprueba antes) → `PostToolUse` → `Stop`.
- Campos comunes: `session_id`, `cwd`, `transcript_path`, `prompt_id`. `UserPromptSubmit` incluye `session_title` y `prompt`. `Stop` incluye `background_tasks` y `stop_hook_active`. `SessionStart` incluye `source`.
- Los cambios en los hooks se aplican sin reiniciar las sesiones.

## Casos límite
- Herramientas en paralelo: mientras un permiso está pendiente, el `PreToolUse`/`PostToolUse` de otra herramienta no apaga el rojo (caso real observado, 2026-10-19).
- Permiso denegado: no llega el `PostToolUse` de esa llamada. Se resuelve con `PostToolUseFailure` de esa llamada, con una llamada nueva de la misma herramienta, o con `UserPromptSubmit`/`Stop`. Si la sesión no vuelve a emitir eventos, el piso se queda en rojo (lo dormirá `idle-timeout` solo si se decide así; hoy `te_necesita` no se duerme).
- Dos llamadas de la misma herramienta en paralelo: el permiso se asocia al último `tool_use_id` visto de esa herramienta, así que el rojo puede durar hasta el `PostToolUse` de la otra llamada o apagarse con la llamada nueva. Se acepta: el error va al lado seguro o se corrige con el siguiente evento.
- Eventos con `session_id` o `hook_event_name` que no son texto se ignoran.
- `Notification` `permission_prompt` solo pone el rojo si hay un permiso pendiente; si llega cuando ya se aprobó, se ignora.
- Subagentes: generan eventos con el mismo `session_id`; cuentan como actividad de la sesión madre, no como pisos nuevos. Sus tokens y coste (`<id>/subagents/*.jsonl`) se suman a los de la sesión madre. Avería: la última respuesta de la conversación principal fue un error de la API (`isApiErrorMessage` en el transcript: `rate_limit`, `authentication_failed` u otro); no cambia el estado y la quita la siguiente respuesta buena. Contexto usado: `context_window.used_percentage` de la statusline, por `session_id`. La sesión cuenta los subagentes trabajando (eventos con `agent_id` hasta su `SubagentStop`; al dormirse vuelve a 0) y el total lanzado (número de esos transcripts).
- `Notification` de inactividad («esperando tu mensaje») después de un `Stop`: no pasa a rojo, se queda en `para_revisar`. Solo las notificaciones de permiso ponen el piso en rojo.
- Varias notificaciones seguidas: se mantiene el rojo y se guarda el último mensaje.
- Transcript enorme: se lee de forma incremental desde el último byte procesado.
- Llega un evento de una sesión sin transcript todavía: se crea el piso con métricas vacías.
