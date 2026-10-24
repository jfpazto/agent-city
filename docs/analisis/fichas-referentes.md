# Fichas de referentes: visualizadores de agentes de código

Aplicada la skill `evaluar-implementacion-agentes` el 2026-10-22. Parte de `investigacion-referentes.md`. Solo web pública, sin descargar ni ejecutar código. Todo lo «verificado» viene de README/docs o fichas de tienda leídos en esta sesión; no se leyó código fuente (ver «Fallos de la skill»).

---

## Ficha: Pixel Agents (https://github.com/pixel-agents-hq/pixel-agents) — evaluada el 2026-10-22
Fuentes consultadas: README del repo (antes pablodelucca/pixel-agents); informe previo.

| # | Dimensión | Valor | Detalle | Evidencia | Origen | Confianza |
|---|---|---|---|---|---|---|
| 1 | Fuente de datos | sí | Hooks de Claude Code (SessionStart, PreToolUse, PermissionRequest, Stop) + transcripts JSONL de `~/.claude/projects/`; modo heurístico solo-JSONL si no hay hooks | README, sección de cómo funciona | verificado | alta |
| 2 | Proveedores | parcial | Claude Code: sí · Codex: no (hoja de ruta; fork aparte) · Gemini: no · Cursor: no. Interfaz `HookProvider` para añadirlos | README, visión/roadmap | verificado | alta |
| 3 | Metáfora visual | sí | Oficina pixel en Canvas 2D; un personaje por sesión que camina a su mesa; editor de layout (máx. 64×64), Areas por carpeta | README | verificado | alta |
| 4 | Estados | parcial | trabajando (escribe/lee/ejecuta): sí · esperando input/permiso: sí (bocadillo) · inactivo: desconocido · error: desconocido | README | verificado | media |
| 5 | Métricas | no | tokens: no · coste: no · límites: no (hoja de ruta: «Health bars for rate limits and token budgets») · duración: desconocido | README, visión | verificado | alta |
| 6 | Multiagente/subagentes | sí | Subagentes efímeros y Agent Teams como personajes separados con roles | README | verificado | alta |
| 7 | Interacción | parcial | crear sesión: sí («+ Agent» lanza Claude Code en carpeta) · aprobar permisos: no (solo opción Skip Permissions al lanzar) · cerrar sesión: desconocido · enviar mensajes: parcial (terminal embebido en CLI) | README | verificado | media |
| 8 | Notificaciones | sí | Sonido opcional al terminar turno o pedir permiso | README | verificado | alta |
| 9 | Histórico | no | No describe historial de sesiones; solo persistencia/undo del layout | README | verificado | media |
| 10 | Privacidad/local | sí | Local; 127.0.0.1 por defecto; con 0.0.0.0 expone UI y WS; token en URL («Treat that URL as a secret»); edita hooks en `~/.claude/` | README, sección standalone | verificado | alta |
| 11 | Instalación | sí | Marketplace/Open VSX o `npx pixel-agents`; puerto cambia en cada arranque salvo `--port` | README | verificado | alta |
| 12 | Plataforma | sí | Extensión VS Code ≥1.105 + CLI web (también móvil); Win/Linux/macOS | README | verificado | alta |
| 13 | Licencia/tracción | sí | MIT · ~9,8k estrellas, 1,7k forks, 225 commits, 37 issues abiertas · último commit: desconocido | Página del repo | verificado | media |
| 14 | Puntos débiles | sí | Solo Claude Code; heurística frágil; sin métricas; riesgo de exposición LAN/token en URL; issues no revisados | README + inferencia | inferido (de las filas 2, 5, 10) | media |

### Huecos
- No: tokens, coste, límites de uso; histórico de sesiones; aprobar permisos desde la UI; Codex/Gemini/Cursor.
- Desconocido: estados inactivo/error y duración (lo resolvería el código del parser de estados); cerrar sesiones; fecha del último commit (página de commits); quejas reales (pestaña Issues, no revisada).

---

## Ficha: Claude Office Visualizer (https://github.com/paulrobello/claude-office) — evaluada el 2026-10-22
Fuentes consultadas: README del repo; informe previo.

| # | Dimensión | Valor | Detalle | Evidencia | Origen | Confianza |
|---|---|---|---|---|---|---|
| 1 | Fuente de datos | sí | Hooks de Claude Code (`make hooks-install`) y plugin de OpenCode que envían eventos a un backend FastAPI; traducción de rutas de transcripts (v0.25.0) | README | verificado | alta |
| 2 | Proveedores | parcial | Claude Code: sí · OpenCode: sí · Codex: no mencionado · Gemini: no mencionado · Cursor: no mencionado | README | verificado | media |
| 3 | Metáfora visual | sí | Oficina pixel en PixiJS: jefe = agente principal, empleados = subagentes; edificio multipiso; pizarra con 12 modos; papelera = contexto | README | verificado | alta |
| 4 | Estados | sí | trabajando: sí · delegando: sí · esperando/necesita al usuario: sí («Needs-you») · terminado/finalizado: sí («Done, Ended») · error: desconocido | README, Command Center | verificado | alta |
| 5 | Métricas | parcial | tokens: sí (se registran) · contexto: sí (papelera, compactación) · coste: no mencionado · límites: no mencionado · duración: desconocido | README | verificado | media |
| 6 | Multiagente/subagentes | sí | Subagentes como empleados generados por el jefe; Command Center con todas las sesiones | README | verificado | alta |
| 7 | Interacción | parcial | navegar plantas/pizarras: sí · focus/portapapeles: sí (con API key) · aprobar permisos: desconocido · crear/cerrar sesión: desconocido · enviar mensajes: desconocido | README | verificado | media |
| 8 | Notificaciones | parcial | «attention toast» y columna Needs-you; sin sonido ni notificación de sistema descritos | README | verificado | media |
| 9 | Histórico | parcial | Recupera sesiones tras reiniciar backend; paginación de replay; sin línea temporal de usuario descrita | README | verificado | media |
| 10 | Privacidad/local | parcial | LOCALHOST_ONLY por defecto; token por `?token=`; payloads llevan I/O de herramientas y rutas; resúmenes por `claude-cli` u endpoint OpenAI-compatible (salida externa opcional) | README | verificado | alta |
| 11 | Instalación | parcial | Clonar + `make install-all` + `make dev-tmux`; Python 3.13, Node 20, uv; Docker en 8050; reiniciar Claude Code para hooks | README | verificado | alta |
| 12 | Plataforma | sí | Web local (Next.js) en Linux/macOS/Windows | README | verificado | alta |
| 13 | Licencia/tracción | sí | MIT · 581 estrellas, 126 forks, 235 commits · última versión v0.25.0 (oct. 2026) | Página del repo | verificado | media |
| 14 | Puntos débiles | sí | Arranque pesado (Python+Node); sin OAuth muestra IDs en bruto; conflictos de puertos 8000/3000; backend remoto mal configurado falla en silencio | README | verificado | media |

### Huecos
- No (no mencionado): coste, límites de uso, Codex/Gemini/Cursor.
- Desconocido: estado de error, duración, aprobar permisos, crear/cerrar sesiones (lo resolvería el código del frontend/API).

---

## Ficha: PixelHQ (https://apps.apple.com/ph/app/pixelhq/id6758467298) — evaluada el 2026-10-22
Fuentes consultadas: ficha de App Store. No se localizó repositorio.

| # | Dimensión | Valor | Detalle | Evidencia | Origen | Confianza |
|---|---|---|---|---|---|---|
| 1 | Fuente de datos | sí | Puente `npx pixelhq` en el portátil que lee archivos de sesión de Claude Code y extrae solo tipo de evento y categoría de herramienta | Ficha App Store, descripción | verificado | media |
| 2 | Proveedores | parcial | Claude Code: sí · Codex/Gemini/Cursor: desconocido | Ficha App Store | verificado | media |
| 3 | Metáfora visual | sí | Oficina pixel; personajes leen en mesa, van a terminal, se reúnen a planificar, usan pizarra | Ficha App Store | verificado | media |
| 4 | Estados | parcial | trabajando (leer/escribir/terminal/buscar/planificar): sí · esperando permiso: desconocido · inactivo: desconocido · error: desconocido | Ficha App Store | verificado | media |
| 5 | Métricas | no | tokens: no · coste: no · límites: no · duración: no (solo extrae metadatos de evento) | «solo metadatos: tipo de evento y categoría de herramienta» | inferido (de la fila 1) | media |
| 6 | Multiagente/subagentes | desconocido | La ficha no lo dice | Ficha App Store (ausencia) | inferido | baja |
| 7 | Interacción | no | Solo visualización + modo demo; sin acciones descritas | Ficha App Store | inferido (ausencia de acciones) | baja |
| 8 | Notificaciones | desconocido | No descrito | Ficha App Store (ausencia) | inferido | baja |
| 9 | Histórico | desconocido | No descrito | Ficha App Store (ausencia) | inferido | baja |
| 10 | Privacidad/local | sí | Wi‑Fi local con Bonjour; código de 6 dígitos; token en Keychain; no envía código, prompts ni rutas completas; analítica TelemetryDeck | Ficha App Store, privacidad | verificado | media |
| 11 | Instalación | sí | App gratuita + `npx pixelhq` en el portátil | Ficha App Store | verificado | media |
| 12 | Plataforma | sí | iOS/iPadOS 17.6+, macOS 14+, visionOS 1.3+ | Ficha App Store | verificado | alta |
| 13 | Licencia/tracción | parcial | Propietaria (Wayne Hsu ltd.) · sin valoraciones suficientes · fecha de versión: desconocida | Ficha App Store | verificado | media |
| 14 | Puntos débiles | sí | Solo Apple; sin métricas; incluye telemetría de uso; código cerrado | Ficha App Store | inferido (de 5, 10, 12) | media |

### Huecos
- No: métricas, interacción.
- Desconocido: otros proveedores, subagentes, notificaciones, histórico, esperando permiso (lo resolverían la web del desarrollador o el paquete npm `pixelhq`).

---

## Ficha: pixtuoid (https://github.com/pixtuoid/pixtuoid, antes IvanWng97/pixtuoid) — evaluada el 2026-10-22
Fuentes consultadas: README del repo; listado Raycast (https://www.raycast.com/IvanWng97/pixtuoid). La URL del informe previo (sourcepulse) da 404.

| # | Dimensión | Valor | Detalle | Evidencia | Origen | Confianza |
|---|---|---|---|---|---|---|
| 1 | Fuente de datos | sí | Hook shim a socket Unix/named pipe + vigilancia de transcripts JSONL (solo lectura) | README | verificado | alta |
| 2 | Proveedores | sí | Claude Code: sí · Codex CLI: sí · Cursor CLI: sí · Gemini: no listado (sí Antigravity CLI) · otros: Copilot CLI, opencode, Kimi, Grok Build… | README, lista de agentes | verificado | media |
| 3 | Metáfora visual | sí | Oficina pixel cenital en la terminal (half-blocks/kitty/SIXEL); cada sesión un compañero en su mesa; zonas, mascotas, clima | README | verificado | alta |
| 4 | Estados | parcial | trabajando: sí · necesita al usuario/permiso: sí («?») · terminado/dormitando: sí · error: desconocido; monitor coloreado por herramienta | README | verificado | alta |
| 5 | Métricas | parcial | tokens: sí (pila de papeles, total al pasar el cursor) · coste: no · límites: no · duración: desconocido | README | verificado | media |
| 6 | Multiagente/subagentes | parcial | Varias sesiones y dashboard en árbol; subagentes no mencionados | README | verificado | baja |
| 7 | Interacción | parcial | traer terminal al frente con clic: sí · conectar/desconectar hooks: sí · aprobar permisos: no descrito · crear/cerrar sesión: no descrito · mensajes: no | README, atajos | verificado | media |
| 8 | Notificaciones | parcial | Solo indicadores visuales y sonido con volumen (`m`, `+/-`) | README | verificado | media |
| 9 | Histórico | desconocido | No descrito | README (ausencia) | inferido | baja |
| 10 | Privacidad/local | sí | Solo local, sin telemetría ni red | README | verificado | media |
| 11 | Instalación | sí | brew, npm, cargo, binarios, .deb; `pixtuoid doctor` | README; Raycast | verificado | alta |
| 12 | Plataforma | sí | TUI (Rust/ratatui) Linux/macOS/WSL2; Windows experimental; ventana flotante | README | verificado | alta |
| 13 | Licencia/tracción | sí | MIT · 503 estrellas, 35 forks, 1.688 commits · último commit: desconocido | Página del repo | verificado | media |
| 14 | Puntos débiles | sí | Sin coste/límites; Windows experimental y sin firmar; vive en la terminal | README | verificado | media |

### Huecos
- No: coste, límites, mensajes.
- Desconocido: subagentes, histórico, error, duración, fecha último commit (CHANGELOG.md los resolvería).

---

## Ficha: Claude HUD (https://github.com/jarrodwatts/claude-hud) — evaluada el 2026-10-22
Fuentes consultadas: README (espejo jsDelivr `@main/README.md`); docs Mintlify (búsqueda). No es visualización espacial: es una status line; se evalúa como referente de métricas.

| # | Dimensión | Valor | Detalle | Evidencia | Origen | Confianza |
|---|---|---|---|---|---|---|
| 1 | Fuente de datos | sí | API de status line (stdin con modelo, contexto, coste, límites) + lectura del transcript para herramientas/agentes/todos | README: «Claude Code runs it with session data on stdin» | verificado | alta |
| 2 | Proveedores | parcial | Claude Code: sí (incl. Bedrock/Vertex) · Codex/Gemini/Cursor: no | README | verificado | alta |
| 3 | Metáfora visual | parcial | Sin metáfora: líneas de texto y barras bajo el input | README | verificado | alta |
| 4 | Estados | parcial | herramientas activas/agentes: sí (opcional) · esperando permiso: desconocido · inactivo/error: desconocido | README | verificado | media |
| 5 | Métricas | sí | tokens: sí · contexto: sí (amarillo 70 %, rojo 85 %) · coste: sí (sesión, diario, semanal) · límites: sí (5 h y semanal con reinicio) · duración: sí | README | verificado | alta |
| 6 | Multiagente/subagentes | parcial | Muestra agentes en ejecución de la sesión actual; no multi-sesión | README | verificado | media |
| 7 | Interacción | no | Solo lectura | README (ausencia) | inferido (es una status line) | media |
| 8 | Notificaciones | no | Solo colores de la barra | README | inferido | media |
| 9 | Histórico | parcial | Registro local para coste diario/semanal | README, `showDailyCost` | verificado | media |
| 10 | Privacidad/local | sí | «local-only», sin peticiones de red; `--extra-cmd` tras variable explícita | README | verificado | alta |
| 11 | Instalación | sí | `/plugin marketplace add` + `/plugin install` + `/claude-hud:setup` | README | verificado | alta |
| 12 | Plataforma | sí | Terminal dentro de Claude Code; Node 18+/Bun | README | verificado | alta |
| 13 | Licencia/tracción | parcial | MIT · ~9k estrellas según tercero (emelia.io), no confirmado en GitHub · último commit: desconocido | README; emelia.io | verificado (licencia) / inferido (estrellas) | media |
| 14 | Puntos débiles | sí | Se refresca por evento, no en tiempo real; límites solo con suscripción; una sola sesión | README, limitaciones | verificado | alta |

### Huecos
- No: interacción, notificaciones, multi-proveedor, vista de varias sesiones.
- Desconocido: estados de permiso/error; estrellas y último commit (página de GitHub).

---

## Ficha: Pixcode (https://github.com/alicomert/pixcode) — evaluada el 2026-10-22
Fuentes consultadas: README del repo; Product Hunt (https://www.producthunt.com/p/pixcode). No es pixel art: panel web.

| # | Dimensión | Valor | Detalle | Evidencia | Origen | Confianza |
|---|---|---|---|---|---|---|
| 1 | Fuente de datos | desconocido | No explica cómo lee las sesiones; lanza las CLI instaladas | README (ausencia) | inferido | baja |
| 2 | Proveedores | sí | Claude Code: sí · Codex: sí · Gemini CLI: sí · Cursor CLI: sí · Qwen, OpenCode: sí | README | verificado | alta |
| 3 | Metáfora visual | no | UI de chat/IDE con paneles (archivos, shell, Source Control, Command Center) | README | verificado | alta |
| 4 | Estados | parcial | pensando/herramienta: sí · esperando aprobación: sí · inactivo/error: desconocido | README | verificado | media |
| 5 | Métricas | no | tokens: no · coste: no (dashboards solo en futuro Pixcode Cloud) · límites: no · duración: desconocido | README | verificado | media |
| 6 | Multiagente/subagentes | sí | Agent Team, Sequential Handoff, Multi-model Review, Decision Debate; proveedor/modelo por agente | README | verificado | alta |
| 7 | Interacción | sí | enviar mensajes: sí · crear sesiones: sí (también por API `px_`) · aprobar permisos: desconocido · cerrar: desconocido | README | verificado | media |
| 8 | Notificaciones | sí | In-app, navegador/escritorio y Telegram (también prompts remotos) | README | verificado | alta |
| 9 | Histórico | sí | Historial de sesiones por proveedor y proyecto | README | verificado | media |
| 10 | Privacidad/local | parcial | Autoalojado, datos en la máquina; Telegram sale fuera si se activa; recomienda proxy/VPN para exponer | README | verificado | media |
| 11 | Instalación | sí | `npx @pixelbyte-software/pixcode`, instaladores de escritorio, daemon | README | verificado | alta |
| 12 | Plataforma | sí | Web + escritorio (Tauri) + móvil; Win/macOS/Linux; Node 22+ | README | verificado | alta |
| 13 | Licencia/tracción | sí | MIT · 19 estrellas, 3 forks, 1.146 commits; lanzado en PH el 2026-05-12 | Página del repo; hunted.space | verificado | media |
| 14 | Puntos débiles | sí | Sin tests ni typecheck («no unit test or typecheck script»); builds macOS sin firmar; puertos inconsistentes; poca tracción | README | verificado | alta |

### Huecos
- No: metáfora espacial, tokens/coste/límites.
- Desconocido: fuente de datos, aprobar permisos, error/inactivo (lo resolvería el código del servidor).

---

## Comparativa

| # | Dimensión | Pixel Agents | Claude Office | PixelHQ | pixtuoid | Claude HUD | Pixcode |
|---|---|---|---|---|---|---|---|
| 1 | Fuente de datos | sí (hooks+JSONL) | sí (hooks+plugin) | sí (lee sesiones) | sí (hooks+JSONL) | sí (statusline+transcript) | desconocido |
| 2 | Proveedores | parcial (Claude) | parcial (Claude, OpenCode) | parcial (Claude) | sí (14, incl. Codex) | parcial (Claude) | sí (6, incl. Codex) |
| 3 | Metáfora | sí (oficina) | sí (oficina multipiso) | sí (oficina) | sí (oficina TUI) | parcial (barras) | no |
| 4 | Estados | parcial | sí | parcial | parcial | parcial | parcial |
| 5 | Métricas | no | parcial (tokens, contexto) | no | parcial (tokens) | sí (todo) | no |
| 6 | Subagentes | sí | sí | desconocido | parcial | parcial | sí |
| 7 | Interacción | parcial | parcial | no | parcial | no | sí |
| 8 | Notificaciones | sí (sonido) | parcial (toast) | desconocido | parcial | no | sí |
| 9 | Histórico | no | parcial | desconocido | desconocido | parcial | sí |
| 10 | Privacidad/local | sí | parcial | sí | sí | sí | parcial |
| 11 | Instalación | sí | parcial | sí | sí | sí | sí |
| 12 | Plataforma | VS Code + web | web | Apple | terminal | terminal | web/escritorio |
| 13 | Licencia/tracción | MIT, ~9,8k★ | MIT, 581★ | propietaria | MIT, 503★ | MIT, ~9k★ (no conf.) | MIT, 19★ |
| 14 | Puntos débiles | solo Claude, sin métricas | arranque pesado | solo Apple | sin coste | sin vista multi-sesión | sin tests |

## Huecos del mercado (para la Ciudad de agentes)
- **Métricas completas en una vista espacial**: solo Claude HUD tiene coste y límites (5 h/semanal), y es una status line de una sesión. Ninguna oficina/ciudad muestra coste ni límites de uso.
- **Codex con metáfora espacial y madurez**: solo pixtuoid (terminal) y Pixcode (sin metáfora) lo soportan.
- **Aprobar permisos desde la visualización**: nadie lo documenta.
- **Histórico/replay visual**: casi ausente (Claude Office tiene algo parcial).
- **Error como estado**: ninguno lo documenta.
- Riesgos a evitar vistos en otros: exponer en 0.0.0.0, token en URL, payloads con I/O de herramientas, hooks que exigen reiniciar Claude Code.

## Nota: referentes no verificados
Habblaud (Jorge Blanco), Flightdeck (Thiago Ferraz), la oficina de 11 agentes con gasto (Abdiel Picado), la oficina con tecnología Microsoft (Clorinda Chan), el artículo «como Los Sims» (Maxime Dupuis), el post de Guillermo Casaus, el de Deven Goratela y Somi AI/Ethan Mollick: **no verificados**. No se hizo ficha.

## Fallos o ambigüedades de la skill
1. **«verificado» mezcla niveles**: la regla dice «código, docs o lo viste funcionando», pero la confianza «alta» exige código o docs explícitos. Un README ¿es «docs» (alta) o «README» (media)? La skill lista README en media y docs en alta, y casi todo aquí sale del README. Apliqué alta cuando el README describe el mecanismo técnico; conviene aclararlo.
2. **Ausencia de mención**: no dice qué valor usar cuando la fuente no menciona algo (¿«no» o «desconocido»?). El criterio de hecho exige evidencia para «no», y la ausencia no es evidencia enlazable. Usé «desconocido» salvo cuando el README describe el alcance completo; aun así hay casos dudosos (p. ej. Claude Office «coste: no mencionado»).
3. **Filas compuestas vs valor global**: no define cómo agregar subvalores (p. ej. 3 sí y 1 desconocido) en el Valor de la fila. Usé «parcial».
4. **Fila 13 compuesta pero no listada como tal** (licencia + estrellas + actividad + último commit) y GitHub vía WebFetch no da la fecha del último commit: queda casi siempre desconocida.
5. **Fila 14 «Puntos débiles»** no encaja con sí/no/parcial; el valor carece de sentido. Usé «sí» = hay puntos débiles visibles.
6. **Fila 3 («Metáfora visual y legibilidad»)**: la legibilidad no se puede evaluar sin verla funcionando; la skill no lo reconoce.
7. **Herramientas fuera de categoría** (Claude HUD, Pixcode no son visualizaciones espaciales): la skill no indica si evaluarlas igual o marcar «fuera de alcance».
8. **Paso 2 pide revisar código**, pero el encargo/entorno puede prohibir descargarlo; no da alternativa (p. ej. leer archivos en la web de GitHub) ni cómo anotar que no se revisó.
9. **Formato evidencia**: pide «URL con ruta concreta», pero una sección de README no tiene ancla estable; acepté «README, sección X».
10. **Repos movidos/URLs rotas** (pixtuoid cambió de org; sourcepulse 404): no dice qué URL usar en el título.
