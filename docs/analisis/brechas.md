# Análisis de brechas: Ciudad de agentes frente a sus referentes

Fecha: 2026-10-22. Fuentes: `investigacion-referentes.md`, `fichas-referentes.md` y `revision-repo.md`, más comprobaciones puntuales en el código del repo (sin modificarlo).
Leyenda: **[V]** verificado (fichas a partir de README o tienda, o código de la Ciudad leído hoy) · **[I]** inferido · **[?]** desconocido.

Comprobado hoy en el código:
- No hay sonido en `packages/web/src`: no aparece `Audio` ni `AudioContext` [V].
- Los subagentes de Codex se marcan con `subagent` y no generan piso propio (`packages/collector/src/codex.ts:24-118`) [V]. No hay representación visual de subagentes [V, por ausencia en `web/src`].
- `/open`, `/new` y `/delete` validan Origin con `isAllowedOrigin` (`packages/collector/src/server.ts:163-211`) [V]. Que `/hook` no lo valide y que se acepte cualquier puerto de localhost lo dice la revisión; no lo he vuelto a comprobar línea a línea [V según revisión].
- La única persistencia del front es `localStorage` para preferencias. No hay historial ni replay [V].

## 1. Tabla comparativa (14 dimensiones)

| # | Dimensión | **Ciudad de agentes** | Pixel Agents | Claude Office | pixtuoid | Claude HUD | Pixcode | PixelHQ |
|---|---|---|---|---|---|---|---|---|
| 1 | Fuente de datos | sí: 10 hooks Claude, statusline y transcripts incrementales; Codex por sondeo de rollouts cada 3 s [V] | hooks + JSONL, con modo heurístico | hooks + plugin OpenCode | hook shim + JSONL | statusline + transcript | [?] | puente que lee sesiones |
| 2 | Proveedores | parcial: Claude completo; Codex sin hooks, sin coste y sin «te necesita» [V] | solo Claude | Claude y OpenCode | 14, incluido Codex | solo Claude | 6, incluido Codex | Claude ([?] el resto) |
| 3 | Metáfora | **ciudad 2.5D**: barrio por proveedor, edificio por proyecto, piso por sesión, depósito y central para límites [V] | oficina con editor | oficina de varias plantas | oficina en TUI | barras | ninguna | oficina |
| 4 | Estados | sí: trabajando, te_necesita (por tool_use_id), para_revisar, dormida. Sin estado de error [V] | parcial | sí (Needs-you, Done) | parcial | parcial | parcial | parcial |
| 5 | Métricas | **sí**: tokens por modelo, coste estimado (solo Claude), límites 5 h y semanal (Claude y Codex), gráfico de 7 días [V] | no (hoja de ruta) | tokens y contexto | tokens | **sí, todas**, para una sesión | no | no |
| 6 | Subagentes | no: ni personaje ni métrica propia; el coste no los suma [V] | **sí** (subagentes y Teams) | **sí** (empleados) | parcial | parcial | sí (equipos) | [?] |
| 7 | Interacción | parcial-alta: abrir sesión en la app o Terminal, crear sesión («EN VENTA»), eliminar (a la Papelera), respuestas rápidas al portapapeles, buscador. No envía nada a la sesión ni aprueba permisos [V] | parcial (+ Agent) | parcial | parcial (foco) | no | **sí** (chat y API) | no |
| 8 | Notificaciones | sí: notificación del navegador, avioneta urgente, humo y aviso al terminar. **Sin sonido** [V] | sí (sonido) | toast | sonido | no | sí (incluye Telegram) | [?] |
| 9 | Histórico | parcial: gráfico de 7 días y bitácora sin contenido; sin replay [V] | no | parcial (replay) | [?] | parcial (coste diario) | sí | [?] |
| 10 | Privacidad/local | sí, con fallos: solo 127.0.0.1 y Origin en WS, pero `/hook` sin validar y `data/events` guarda el payload completo sin rotación [V] | sí (riesgo con 0.0.0.0 y token en la URL) | parcial | sí | sí | parcial | sí (con telemetría) |
| 11 | Instalación | parcial: clonar, `./init.sh`, `npm run dev` y `hooks:install`, que falla si no existe `settings.json` [V] | sí (Marketplace o npx) | pesada | sí (brew, npm, cargo) | sí (plugin) | sí (npx) | sí |
| 12 | Plataforma | web local, **solo macOS** [V] | VS Code + web | web | terminal | terminal | web, escritorio y móvil | Apple |
| 13 | Licencia/tracción | sin licencia ni publicar (open-source-release sin empezar) [V] | MIT, ~9,8k★ | MIT, 581★ | MIT, 503★ | MIT, ~9k★ (sin confirmar) | MIT, 19★ | propietaria |
| 14 | Puntos débiles | seguridad de `/hook`, subagentes, Codex a medias, rendimiento (relee transcripts y rollouts), docs desactualizados, 4 features en passing sin validar [V] | solo Claude, sin métricas | arranque pesado | sin coste | una sola sesión | sin tests | solo Apple |

## 2. Ventajas propias (lo que hace la Ciudad y no hace ningún referente verificado)

1. **Coste y límites dentro de una vista espacial y de varias sesiones** [V]. Solo Claude HUD tiene coste y límites, y lo hace como status line de una sola sesión. Ninguna oficina los muestra.
2. **Límites de uso de Codex** (central eléctrica) además de los de Claude (depósito de agua), y el barrio a media luz al agotar las 5 h [V]. Nadie más representa los límites, y Pixel Agents solo los tiene en la hoja de ruta.
3. **Jerarquía de tres niveles: proveedor, proyecto git y sesión** [V]. Los demás usan un personaje por sesión o «Areas» por carpeta.
4. **«Te necesita» exacto por tool_use_id** y estado **para_revisar** que se limpia al abrir la sesión [V]. Ningún referente documenta «para revisar».
5. **Avioneta urgente con selector de prioridad** [V]. No tiene equivalente.
6. **Panel de detalle con gráfico de 7 días y bitácora sin contenido** [V]. Es histórico por sesión que respeta la privacidad.
7. **Respuestas rápidas al portapapeles sin escribir nunca en la sesión** [V]. Es una interacción más segura que los terminales embebidos o `--dangerously-skip-permissions` de Pixel Agents.
8. **Crear y eliminar sesiones desde la fachada** (con Claude y Codex) [V]. Pixel Agents solo crea, y con Claude.
9. Modo demo y verificación con typecheck y tests en `init.sh` [V]. Pixcode, por ejemplo, no tiene tests.

## 3. Huecos de los demás que la Ciudad puede cubrir

| Hueco o queja ajena | Quién lo tiene | Ciudad | Esfuerzo | Qué tocar |
|---|---|---|---|---|
| Coste y tokens por agente | nadie con metáfora (Picado [NE]) | **lo cubre** en Claude; **a medias** porque no suma subagentes ni Codex | M | `packages/collector` (parser de transcripts, tabla de precios), feature `cost-estimate` |
| Límites de uso (hoja de ruta de Pixel Agents) | solo Claude HUD | **lo cubre** (feature `usage-limits`, en passing sin validar); queda «sin dato» si hay otra statusline | S | validar `usage-limits` y documentar cómo convivir con otra statusline |
| Codex de verdad con metáfora | pixtuoid (TUI), Pixcode (sin metáfora) | **a medias**: sin hooks, sin «te necesita», sin coste, todo cuenta como comando | M-L | features `codex-event-probe` y `codex-sessions`, `collector/src/codex.ts` |
| Aprobar permisos desde la visualización | nadie | **falta**, a propósito: solo portapapeles | L (y arriesgado) | fuera del MVP; requeriría escribir en la sesión |
| Histórico o replay visual | casi nadie (Claude Office parcial) | **a medias**: 7 días y bitácora, sin rebobinar | L | «historial/rebobinar», fuera del MVP |
| Error como estado | nadie | **falta** | S-M | `session-state-machine` (añadir estado de error a partir de PostToolUse/StopFailure [I]) |
| No exponerse en 0.0.0.0 ni poner el token en la URL | riesgo en Pixel Agents y Claude Office | **lo cubre** (127.0.0.1, sin token en la URL) | — | — |
| Hooks que necesitan reiniciar Claude Code | Claude Office, Pixel Agents | **[?]**, no se ha comprobado | S | `docs/pruebas-manuales.md` |
| Arranque pesado (Python + Node) | Claude Office | **lo cubre a medias**: solo Node, pero sin npx ni binario | M | feature `open-source-release` |
| Vista de varias sesiones con métricas | falta en Claude HUD | **lo cubre** | — | — |
| Sesiones colgadas o en rojo para siempre | sin dato en los demás | **falta** (sin SessionEnd) | S | máquina de estados e `idle-timeout` |

## 4. Lo que los demás hacen mejor y conviene copiar

| Qué | Quién | Estado en la Ciudad | Esfuerzo | Comentario |
|---|---|---|---|---|
| Subagentes como personajes o pisos hijos | Pixel Agents, Claude Office | **falta** [V] | M | Lo más pedido visualmente. Por ejemplo, un «andamio» o anexo en el piso con su propia métrica, y además corrige la debilidad 6 (el coste no suma subagentes). |
| Sonido opcional (al terminar o al pedir permiso) | Pixel Agents, pixtuoid | **falta** [V] | S | Con Web Audio y un interruptor en la HUD. |
| Instalación en un comando (`npx` o plugin) | Pixel Agents, Claude HUD, pixtuoid | **falta** | M | Encaja en `open-source-release`. |
| Soporte multi-CLI con interfaz de proveedor | pixtuoid (14), Pixcode (6), `HookProvider` de Pixel Agents | Claude + Codex a medias | L | Primero completar Codex y abstraer un «proveedor» en el colector [I]. |
| Multiplataforma (Linux/Windows) | casi todos | solo macOS (abrir sesión depende de apps macOS) [V] | M | Aislar `/open` por plataforma. |
| Contexto visible (papelera que se vacía al compactar) | Claude Office, Claude HUD (70/85 %) | **[?]**, no consta | S-M | Un indicador de contexto por piso. |
| Editor de oficina o de ciudad | Pixel Agents | falta | L | Bajo impacto en la propuesta de valor; no lo priorizo. |
| Móvil o remoto (puente de metadatos por LAN) | PixelHQ, Pixcode | falta | L | Contradice «solo 127.0.0.1». Solo con emparejamiento como PixelHQ, y fuera del MVP. |
| Notificaciones externas (Telegram) | Pixcode | falta | M | Saca datos de la máquina; contradice AGENTS.md. No copiar. |

## 5. Propuesta priorizada

### Bloqueantes de seguridad antes de publicar el código (open source)
1. **Validar `/hook`**: exigir `content-type: application/json` y rechazar peticiones con cabecera Origin de navegador, o usar un secreto local en un archivo con permisos 600 que lean los hooks. Ahora mismo cualquier web puede falsear estados [V según revisión]. Esfuerzo S. `packages/collector/src/server.ts`.
2. **`isAllowedOrigin` limitado al puerto del front** (5173 o el configurado) para `/open`, `/new` y `/delete`. Hoy acepta cualquier puerto de localhost, y eso permite a otro servicio local crear o eliminar sesiones. Esfuerzo S. `server.ts`.
3. **`data/events`**: no guardar el payload completo (prompts, entradas y salidas de herramientas) o redactarlo, con rotación y tamaño máximo. Esfuerzo S-M.
4. **Limpiar datos personales del repo y del historial git** (`data/`, fixtures, rutas con el usuario), añadir LICENSE y README y probar con un clon limpio. Esfuerzo M. Feature `open-source-release`.
5. `hooks:install` robusto si no existe `~/.claude/settings.json`, con copia de seguridad antes de editar. Esfuerzo S.

### Mejoras de producto (ordenadas por impacto / esfuerzo)
| # | Mejora | Impacto | Esfuerzo | Dónde |
|---|---|---|---|---|
| 1 | Validar las 4 features en passing y poner al día `feature_list`, docs y commits (debilidades 13-20) | alto (es requisito para publicar) | S | `feature_list.json`, `PROGRESS.md`, `DESIGN.md` |
| 2 | Sonido opcional al pasar a «te necesita» o «para revisar» | medio-alto | S | `web/src/hud`, `urgent` |
| 3 | Cerrar sesiones colgadas y evitar que el rojo se quede para siempre (timeout sin SessionEnd) | alto (confianza en los datos) | S | máquina de estados, `idle-timeout` |
| 4 | Tokens sin caché leída en el total visible (o separada) | medio | S | parser de transcripts |
| 5 | Subagentes visibles (anexo en el piso) y con su coste sumado | alto (diferencial visual que tienen los dos referentes principales) | M | collector y `web/src/tower` |
| 6 | Codex completo: coste con tabla de precios, «te necesita» (`codex-event-probe`) y lectura incremental del rollout | alto (hueco del mercado) | M-L | `collector/src/codex.ts` |
| 7 | Rendimiento: lectura incremental en lugar de reabrir todo cada 30 s, y render por diferencias en el front | medio (escala con muchas sesiones) | M | colector y `web/src/main.ts` |
| 8 | Estado de error visible (piso con avería) | medio (nadie lo tiene) | S-M | máquina de estados y `floor-state-colors` |
| 9 | Indicador de contexto por piso (umbrales 70/85 %) | medio | S-M | statusline o transcript y panel |
| 10 | Instalación en un comando (`npx ciudad-agentes`) y soporte Linux | alto para la adopción | M | `open-source-release` |

Orden sugerido: bloqueantes 1-5, luego mejoras 1, 3, 2 y 4 (rápidas), después 5 y 6 (diferenciales), y por último 7-10.

## Verificado frente a inferido
- **Verificado**: todo lo de la Ciudad sale de la revisión del repo y de las comprobaciones de código citadas arriba. Lo de los referentes sale de sus README o fichas de tienda (fichas del 2026-10-22). No se leyó código de los referentes ni sus issues.
- **Inferido**: que copiar subagentes, sonido o npx mejore la adopción; la forma de detectar el estado de error; que Pixcode no tenga métricas más allá de su README; las estrellas de Claude HUD.
- **Desconocido**: las quejas reales de los usuarios de los referentes (no se revisaron issues), y si la Ciudad necesita reiniciar Claude Code tras `hooks:install`.
- Los referentes de LinkedIn (Habblaud, Flightdeck, Picado y los demás) no están verificados y quedan fuera de la tabla.
