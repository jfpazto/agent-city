# Build Brief

## Problema
Tengo muchas sesiones de Claude Code abiertas a la vez en la app de escritorio y no sé de un vistazo cuál me está esperando, cuál ya terminó y cuánto está gastando cada una. Si tardo en ver una petición de permiso, esa sesión se queda parada.

## Solución actual
Revisar las sesiones una por una en la barra lateral de la app y fiarme de las notificaciones sueltas. No tengo una vista conjunta ni datos de consumo por sesión.

## Usuarios
Solo el autor, en su Mac. Sin login, sin despliegue y sin multiusuario.

## Objetivos
- Ver cada proyecto/agente como un edificio pixel art y sus sesiones como pisos, con el estado en vivo por color.
- Detectar en segundos qué sesión me necesita.
- Conocer los tokens, el coste estimado y la actividad de cada sesión.
- Tener una base que pueda crecer hacia la ciudad completa del video de referencia.

## Fuera de alcance (MVP)
- Enviar respuestas a las sesiones (solo se copian al portapapeles).
- Sesiones de la nube, de la CLI o del Agent SDK (pueden funcionar de rebote, pero no se garantiza).
- Mensajes entre sesiones, tareas programadas y aeropuerto, avioneta, paloma de correo, Slack, reloj o salud, noticias, tráfico según la CPU, rebobinar, eventos aleatorios y vista 3D. Quedan para fases posteriores (ver `docs/risks-and-open-questions.md`).
- Instalador, empaquetado o publicación para otras personas.

## Primera versión útil (MVP)
1. Hooks de Claude Code en `~/.claude/settings.json` que envían cada evento al colector.
2. Un colector en Node que guarda el estado de cada sesión y lee de forma incremental su transcript.
3. Un front con Vite, TypeScript y PixiJS que se conecta al colector por WebSocket y pinta:
   - la torre con un piso por sesión y su color de estado;
   - la barra de estado con los contadores y los tokens totales;
   - el panel de detalle al hacer clic, con las métricas, la bitácora, las respuestas rápidas y la opción de abrir la sesión.

## Cómo se valida
- Abrir 3 sesiones y provocar cada estado: lanzar una tarea (verde), pedir algo que requiera permiso (rojo), dejar que termine (amarillo) y no tocarla durante el tiempo de inactividad (dormida). El piso debe cambiar de color en menos de 2 segundos.
- Comparar los tokens del panel con la suma hecha a mano sobre el `.jsonl` de una sesión.
- Reiniciar el colector y comprobar que la torre se reconstruye a partir de los transcripts.

## Criterios de éxito
- Durante una semana de uso real, ninguna petición de permiso pasa desapercibida más de un minuto si la ciudad está abierta.
- El colector consume poca CPU (menos del 2 % en reposo) y no bloquea las sesiones: si el colector está caído, los hooks fallan en silencio y Claude Code sigue funcionando.

## Notas
Evolución posterior al MVP (2026-10-19): la ciudad pasa de una torre única a un edificio por proyecto/agente. La unidad visual superior es el proyecto; la sesión sigue siendo la unidad de estado y métricas. Se mantiene el stack, la operación local y el panel por sesión. El buscador y los avisos deben localizar pisos entre edificios.

Dirección visual acordada después: mapa superior 2.5D con calles y manzanas, barrios separados para Claude y Codex, y acceso a una vista frontal de cada edificio con sus sesiones por pisos. Si un proyecto usa ambos proveedores, tiene un edificio en cada barrio con las sesiones correspondientes. Volver al mapa conserva su posición. La vista está implementada, con vida ambiental y puentes automáticos/manuales; Codex se recoge por sondeo de sus rollouts (sus hooks siguen pendientes). Los puentes representan relaciones y no envían mensajes.

La referencia visual es el video de Kōdo Factory («Mundo/Nave de agentes»), ya analizado fotograma a fotograma. Solo se usa como inspiración; no se copian sus assets.
