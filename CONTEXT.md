# Contexto

## Glosario

### Ciudad
La aplicación completa: la vista que agrupa los edificios de los proyectos, la calle y los indicadores globales.

### Proyecto / agente
Unidad de trabajo identificada por su repositorio Git. Cada proyecto es un agente; sus sesiones ocupan los pisos de su edificio. Las subcarpetas y los worktrees del mismo repositorio pertenecen al mismo proyecto. En la ciudad por barrios, un mismo proyecto tiene un edificio en Claude y otro en Codex si tiene sesiones de ambos proveedores.

### Barrio
Zona de la ciudad que reúne los edificios de un proveedor de sesiones. En la dirección acordada hay un barrio Claude y otro Codex, organizados en manzanas y separados por calles.

### Proveedor
Sistema que ejecuta una sesión: Claude Code o Codex. Determina el barrio, no la identidad del proyecto/agente.

### Manzana
Bloque urbano delimitado por calles que contiene solares y edificios. Sirve para organizar y recorrer el mapa desde arriba.

### Puente
Pasarela que representa una relación: automática entre edificios del mismo proyecto en barrios diferentes, o manual entre proyectos distintos. No representa ni envía mensajes entre sesiones.

### Torre
Fachada 2.5D del edificio que representa un proyecto/agente dentro de un barrio. Cada piso ocupado representa una sesión de ese proyecto. «Torre» es el nombre usado por la primera vista, que reunía todas las sesiones en un único edificio.

### Piso
Representación visual de una sesión dentro de la torre. Un piso libre se muestra como «En venta».

### Sesión
Una conversación de trabajo identificada por su id, proveedor y carpeta (`cwd`). Hoy los datos reales proceden de Claude Code y de su transcript `.jsonl` en `~/.claude/projects/`; de Codex se leen sus rollouts en `~/.codex/sessions` (sin hooks todavía, así que nunca pasan a rojo). Pertenece a un proyecto/agente y se pinta como un piso de su edificio.

### Estado de sesión
Uno de: `trabajando` (verde), `te_necesita` (rojo), `para_revisar` (amarillo) o `dormida` (sin luz). Ver `docs/domain-model.md`.

### Evento
Aviso puntual que el colector recibe de un hook de Claude Code (por ejemplo, `PreToolUse`, `Notification` o `Stop`) y que puede cambiar el estado de una sesión.

### Colector
Proceso local en Node que recibe los eventos, lee los transcripts y sirve el estado al front.

### Transcript
Archivo `.jsonl` de una sesión donde Claude Code guarda los mensajes, el uso de tokens y las llamadas a herramientas.

### Métricas de sesión
Datos derivados del transcript: tokens, coste estimado a precio de API, número de comandos, lecturas y acciones web, archivos tocados y modelo.

### Bitácora
Lista cronológica de las últimas acciones de una sesión («Escribiendo código», «Ejecutando comandos»…).

### Panel de detalle
Panel lateral que se abre al hacer clic en un piso y muestra las métricas, la bitácora y las respuestas rápidas.

### Respuesta rápida
Botón con un texto predefinido («Sí, continúa», «Espera, no hagas nada todavía») que se copia al portapapeles. No se envía a la sesión.

### Límite de uso
Parte gastada del límite de la cuenta en cada proveedor, en dos ventanas: 5 h y semanal. Se recarga a una hora conocida. En la ciudad se muestra lo que **queda**: depósito de agua en el barrio Claude, central eléctrica en el de Codex.

### Barra de estado
Barra superior con los contadores globales (trabajando, te necesitan, para revisar, dormidas) y los tokens totales.

## Términos rechazados o ambiguos

### Agente como sinónimo de sesión
Usar `Sesión` para una conversación y `Proyecto` o `Agente` para la unidad representada por un edificio. Un subagente técnico de Claude no crea otro edificio ni otro piso.
