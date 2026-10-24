# Referentes: agentes de IA como oficina o ciudad pixel

Fecha: 2026-10-22. Solo web abierta, sin login. Leyenda: **[V]** verificado con fuente, **[I]** inferencia, **[NE]** no encontrado.

Nota general: las búsquedas por nombre de persona (Blanco, Casaus, Ferraz, Picado, Chan, Dupuis, Goratela, Somi AI/Mollick) no devolvieron nada indexado en la web abierta. Los posts de LinkedIn no se pueden leer sin sesión. Lo que sí aparece una y otra vez es un pequeño ecosistema de proyectos abiertos, sobre todo **Pixel Agents**, que es casi seguro el proyecto del que hablan varios de esos posts [I].

## 1. Jorge Blanco: «Habblaud»
- Proyecto, URLs, stack y lo demás: [NE]. No hay ningún resultado para «Habblaud». Según el encargo, es una oficina con una sala por proyecto y soporte para Claude Code y Codex. Por el nombre, parece inspirada en Habbo Hotel [I].
- Lo más parecido con soporte de Codex: el fork `MichaelMa907/pixel-agents-codex` (https://github.com/MichaelMa907/pixel-agents-codex) [V, existe; detalles sin revisar] y Pixcode, un panel que no es pixel art (https://www.producthunt.com/p/pixcode) [V].

## 2. Guillermo Casaus: post sobre «Pixel Agents»
- No encontré el post [NE]. Lo más probable es que hable del proyecto de Pablo de Lucca (ver 7) [I].

## 3. Thiago Ferraz: «Flightdeck»
- [NE]. No hay rastro ni de Flightdeck ni de Ferraz.
- Paneles parecidos para Claude Code [V]: Claude HUD de Jarrod Watts, un plugin de terminal con unas 9k estrellas según https://emelia.io/hub/claude-hud-plugin-review; CCDash, autoalojado (https://www.producthunt.com/p/ccdash); cltop, un TUI con tokens y herramientas (https://pypi.org/project/cltop/); claude-code-ui de KyleAMathews, que lee `~/.claude/projects/` (https://www.sourcepulse.org/projects/22580959); claude-session-dashboard (https://github.com/dlupiak/claude-session-dashboard); y la plantilla OTel de SigNoz (https://signoz.io/docs/dashboards/dashboard-templates/claude-code-dashboard/).

## 4. Abdiel Picado: oficina con 11 agentes y el gasto de cada uno
- [NE]. La búsqueda solo devolvió ruido de béisbol. Mostrar el coste por agente es justo lo que no hace Pixel Agents, que no tiene coste ni tokens [V]. Si existe, podría ser un hueco diferencial [I].

## 5. Clorinda Chan: oficina multiagente con tecnología de Microsoft
- [NE]. Lo más probable es que use Microsoft Agent Framework, el sucesor de AutoGen y Semantic Kernel [I].
- Algo cercano [V, solo el fragmento indexado]: el post de LinkedIn https://ie.linkedin.com/in/okopets sobre «Pixel Office», un proyecto final del programa Gen GenAI. Muestra sesiones de Claude Code y Cursor como personajes en su mesa: teclean cuando están ocupados, pasean cuando están inactivos y saludan al terminar. Stack: React + Vite, Express, Postgres y SSO de Entra ID. Se usa internamente. La parte de Microsoft podría ser Entra ID [I].

## 6. Maxime Dupuis: artículo sobre mostrar agentes «como Los Sims»
- [NE]. No encontré el artículo ni la expresión. Hay un artículo de divulgación sobre Pixel Agents: https://prompts.brightcoding.dev/blog/stop-managing-ai-agents-blind-pixel-agents-exposes-what-theyre-actually-doing [V, existe].

## 7. Deven Goratela / extensión «Pixel Agents» de VS Code (referente principal) [V]
- Repo: https://github.com/pablodelucca/pixel-agents, que ahora parece estar en https://github.com/pixel-agents-hq/pixel-agents. Se instala desde VS Code Marketplace y Open VSX, y hay un CLI con `npx pixel-agents` que abre la oficina en el navegador.
- Stack: TypeScript, React 19, Vite, Canvas 2D (webview) y Fastify para el CLI. Pruebas con Vitest y Playwright.
- Datos: por defecto, hooks de Claude Code (SessionStart, PreToolUse, PermissionRequest, Stop…), completados con los transcripts. Si los hooks no están disponibles, cae a un modo heurístico que lee los JSONL de `~/.claude/projects/`.
- Qué muestra: un personaje por sesión, con animación según lo que hace (escribir, leer, ejecutar). Bocadillos cuando espera o pide permiso, un sonido al acabar, subagentes y Agent Teams como personajes enlazados, editor de la oficina, «Areas» por carpeta y mascotas. **No muestra tokens ni coste**. En la hoja de ruta hay «barras de vida» para los límites de uso y el presupuesto de tokens.
- Interacción: sí. Con «+ Agent» se lanza Claude Code. Desde el CLI, los clientes con token pueden instalar hooks y lanzar agentes. Hay una opción `--dangerously-skip-permissions`.
- Proveedores: solo Claude Code. Codex, Gemini y Cursor están en la hoja de ruta.
- Local y privacidad: todo corre en local. Avisos del propio proyecto: al enlazar a 0.0.0.0 la oficina queda expuesta en la red, el token va en la URL como secreto y el puerto cambia en cada arranque.
- Licencia: MIT. Tracción: unas 9,8k estrellas y 1,7k forks, con muchos forks (codex, agent-friday, martinmunozhr).
- Puntos débiles: solo admite Claude Code; el modo heurístico es frágil; no muestra coste ni límites; la exposición en red y el token en la URL son riesgos. No revisé los issues [I].
- Sobre Goratela: no encontré su post [NE].

## 8. Somi AI / Ethan Mollick
- [NE]. No encontré ningún post de Mollick ni nada de Somi AI. En X o en «One Useful Thing» haría falta el enlace exacto.

## Otros proyectos relevantes [V salvo que se indique]
| Proyecto | URL | Notas |
|---|---|---|
| Claude Office Visualizer (Paul Robello) | https://github.com/paulrobello/claude-office | MIT, unas 580 estrellas. Next.js, **PixiJS**, FastAPI y Zustand. Usa hooks de Claude Code y un plugin para OpenCode. El agente principal es el «jefe» y los subagentes, «empleados». Una papelera se llena con el contexto y se vacía al compactar. Edificio de varias plantas, centro de mando con todas las sesiones, pizarra y estado de git. Necesita un token OAuth para generar nombres y resúmenes. Es lo más cercano a nuestra ciudad, porque comparte PixiJS y hooks. |
| PixelHQ (iOS) | https://apps.apple.com/ph/app/pixelhq/id6758467298 | Un puente en el portátil envía solo metadatos por la wifi local, sin código, prompts ni rutas completas. |
| pixtuoid | https://www.sourcepulse.org/projects/31076420 | La oficina pixel dentro de la terminal. |
| Pixel Clodeffice | https://www.producthunt.com/products/pixel-clodeffice | Juego con 4 agentes, cada uno con un modelo de Claude. |
| Pixcode | https://www.producthunt.com/p/pixcode | Sala de control autoalojada para Claude Code, Codex, Gemini, Cursor, Qwen y OpenCode. No es pixel art. |
| Observabilidad general | sim.ai, AgentOps, Langfuse, Opik, Observatory | Ninguna tiene estética de videojuego. |

## Conclusiones para la Ciudad de agentes [I]
- Huecos que no cubre nadie de lo verificado: **coste y tokens por agente**, **límites de uso** (Pixel Agents solo los tiene en la hoja de ruta) y **Codex de verdad** (solo hay un fork).
- Patrón común: hooks como fuente principal y transcripts como apoyo; todo local; los subagentes como personajes hijos.
- Riesgos que los demás documentan y conviene evitar: exponerse en 0.0.0.0, poner el token en la URL y que los hooks no se activen hasta reiniciar Claude Code.
