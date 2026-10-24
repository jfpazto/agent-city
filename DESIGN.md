---
name: Ciudad de agentes
description: Ciudad pixel art 2.5D, con mapa superior por barrios de Claude y Codex y acceso frontal a los edificios y sus sesiones.
designAssets:
  sourceOfTruth: []
  generatedConcepts: []
colors:
  sky: "#7FB2E5"
  ground: "#AEC5A2"
  road: "#647587"
  towerFrame: "#1E2230"
  floorEmpty: "#E8E4DA"
  floorDark: "#2B3045"
  working: "#3DDC84"
  needsYou: "#E5484D"
  toReview: "#F5C542"
  sleeping: "#4A5068"
  panelBg: "#141826"
  panelText: "#E6E8EF"
  accent: "#8B7CF6"
typography:
  ui:
    fontFamily: "'Press Start 2P', 'JetBrains Mono', monospace"
    fontSize: 10px
  body:
    fontFamily: "'JetBrains Mono', ui-monospace, monospace"
    fontSize: 12px
rounded:
  sm: 0px
  md: 2px
spacing:
  pixel: 4px
  floorHeight: 96px
  floorWidth: 240px
components:
  floor:
    border: "2px {colors.towerFrame}"
    stateGlow: "relleno semitransparente con el color del estado"
  statusChip:
    backgroundColor: "{colors.panelBg}"
    textColor: "{colors.panelText}"
---

# Dirección de diseño

## Resumen
Mapa pixel art desde arriba, con calles, manzanas y barrios por proveedor. Seleccionar un edificio abre su fachada 2.5D, con las sesiones por pisos. Inspirados en el video de referencia (solo como inspiración; no se copian sus assets). Lo importante es poder leer los proyectos y estados de un vistazo; la decoración va después.

## Barrios y dos niveles de vista (implementado el 2026-10-19)

Dirección elegida por el autor: **Barrio 2.5D**, con volumen, sombras e interiores legibles, añadiendo una vista superior para recorrer la ciudad. La vista está implementada y el barrio de Codex se llena con sus rollouts.

- **Entrada a la app**: mapa desde arriba, ligeramente inclinado, con calles y manzanas. Se ven azoteas y un lateral corto de los edificios, no una fila de fachadas frontales.
- **Barrios por proveedor**: Claude y Codex tienen zonas propias, con nombre visible y tratamiento de materiales distinto; la identidad del barrio no depende solo del color. Los colores de estado se reservan para actividad y atención.
- **Edificios por proyecto dentro de cada barrio**: si el mismo repositorio tiene sesiones en Claude y Codex, aparece un edificio en cada barrio. Ambos representan el mismo proyecto/agente; cada uno contiene solo las sesiones de su proveedor. Decisión confirmada por el usuario.
- **Navegación**: arrastre y zoom del mapa; accesos a ciudad completa, Claude y Codex. Los edificios se ordenan en cada barrio del proyecto trabajado más recientemente al más antiguo (por la última actividad de sus sesiones), fila a fila.
- **Entrar al edificio**: seleccionar su azotea o su nombre abre la fachada 2.5D con las sesiones por pisos; el piso elegido muestra su panel de detalle. Desde lejos se identifica lo urgente en el edificio; desde dentro se lee qué sesión lo necesita.
- **Sesión nueva y eliminar desde la fachada** (2026-10-21): el piso «EN VENTA» lleva la pista «+ clic: nueva sesión»; un clic abre una sesión nueva del mismo agente en la carpeta del proyecto (app de Claude o de Codex; Terminal de respaldo). Deslizar un piso a la derecha descubre una franja roja «Eliminar →» que pasa a «Suelta: eliminar» a partir de 120 px; al soltar pide confirmación y la conversación va a la Papelera. Las sesiones trabajando o esperando permiso no se eliminan. Un arrastre vertical o hacia la izquierda sigue moviendo la vista.
- **Salir de la fachada con un clic** (2026-10-21): un clic (sin arrastrar) en el cielo, la calle o los laterales de la escena vuelve directamente al mapa superior, con la posición conservada. Sobre el edificio (pisos, placa, azotea o lateral) se comporta como antes: un piso abre su panel y el resto lo cierra.
- **Banderas del rótulo** (2026-10-21): bajo el nombre de cada edificio, una bandera por estado con su número de sesiones, de lo urgente a lo tranquilo: roja parpadeante (requiere aprobación), verde (trabajando), amarilla (finalizada, para revisar) y gris (dormida). Solo aparecen los estados con sesiones. Una leyenda fija abajo a la izquierda del mapa las explica y se oculta dentro de la fachada. Con movimiento reducido, la roja no parpadea.
- **Humo y cartel ✓** (2026-10-24, antes el humo marcaba «finalizada»): un edificio con alguna sesión trabajando echa bocanadas grises desde su azotea. Uno con alguna sesión para revisar muestra encima un cartel amarillo con ✓ que flota suave hasta que se revisa. Cuando una sesión viva pasa de trabajando/te necesita a finalizada, la barra inferior dice «✓ … ya respondió» y, con permiso, llega un aviso del navegador. Con movimiento reducido, humo y cartel quedan quietos.
- **Volver**: se recuperan posición y zoom del mapa. Si un proyecto existe en ambos barrios, se puede saltar al edificio del otro proveedor sin mezclar sus sesiones.
- **Interiores**: escritorios, pantallas y actividad de sesión; conservar nombres, estados con icono/texto y métricas. Respetar movimiento reducido. El objetivo sigue siendo localizar lo que necesita atención.

Referencias de la propuesta aprobada, con datos inventados:

- `docs/design/concepts/neighborhood-map-proposal.png`: organización superior en manzanas, Claude a un lado y Codex al otro.
- `docs/design/concepts/building-front-proposal.png`: edificio seleccionado de frente, sesiones por pisos y panel lateral.

Estas capturas fijan la dirección visual, no medidas exactas. La implementación reutiliza Pixi y mantiene el panel de métricas existente. Evidencia actual en `docs/design/evidence/city-neighborhood-map.png` y `city-neighborhood-front.png`.

## Recursos de diseño
No hay recursos propios. La referencia son los fotogramas del video analizado (Kōdo Factory), como inspiración y no como fuente de verdad.

## Sensación
Juego de gestión retro (tipo SimTower): cálido, vivo y legible. El color del piso tiene que verse a 2 metros de la pantalla.

## Colores
- Los estados mandan: verde = trabajando, rojo = te necesita (con un parpadeo suave), amarillo = para revisar y gris apagado = dormida.
- El rojo y el amarillo no se usan para nada decorativo.
- El estado no depende solo del color: cada piso lleva también un icono o una etiqueta para quien no distinga bien los colores.

## Tipografía
Fuente pixel para etiquetas cortas y monoespaciada para los datos del panel.

## Disposición
- Barra global con contadores y tokens; buscador por proyecto, título o proveedor. En ventanas de hasta 1100 px, el buscador ocupa una segunda fila.
- Navegación HTML con ciudad completa, Claude, Codex, selector de proyectos, zoom, Puentes y control Vida. Se adapta en varias filas; el mapa y los paneles arrancan debajo de su altura real.
- Mapa superior: tres columnas de manzanas por barrio; solares de 236 × 216 px, calles de 40 px y avenida entre barrios. Crece hacia abajo. Azoteas de 126 × 104 px, lateral de 14 px, sombras duras, bancos, árboles y coches discretos.
- Rótulos HTML accesibles sobre el mapa: proyecto, sesiones y señal de estado. A zoom muy lejano se simplifican a una marca de estado; el selector conserva el acceso por nombre. Sin huecos: los solares siguen el orden por actividad reciente.
- Fachada: una columna de pisos de 240 × 96 px, marco de 4 px y azotea/lateral con volumen. Al menos dos pisos y uno libre arriba, sin pisos libres intermedios (cuando una sesión se va, las de encima bajan); de abajo arriba, de la sesión con actividad más antigua a la más reciente (la más reciente justo bajo el «en venta»); interiores con mesa, monitor y personaje, mensaje cuando se necesita permiso.
- Dos cámaras separadas: volver del edificio conserva posición y zoom del mapa. Arrastre en ambos ejes; rueda = zoom en mapa, scroll vertical en fachada; Ctrl/⌘ + rueda = zoom de fachada.
- Panel de sesión a la derecha, debajo de la navegación. En escritorio deja espacio para la fachada; en ventanas pequeñas se superpone. Selectores de proyecto y sesión permiten recorrer todo con teclado.

## Formas
Píxel duro: sin bordes redondeados ni sombras difuminadas, escalado `nearest`.

## Componentes
- **Avioneta de lo urgente**: avioneta de 16×10 píxeles (blanca con alas de acento) que cruza el cielo bajo la barra arrastrando una pancarta clara con borde oscuro, una franja roja a la izquierda y el texto «N te necesita(n): título…». Solo aparece si algún piso lleva más de 1 min en rojo; la franja roja es la única excepción decorativa al rojo, porque señala justo ese estado.
- **Piso**: placa con las iniciales y el título de la sesión, iluminación del estado, bocadillo con el último mensaje cuando está en rojo, y tokens del día en una esquina.
- **Ayudantes (subagentes)** (2026-10-24): un personaje pequeño con camiseta de acento por cada subagente trabajando, a la derecha del monitor; hasta 3 y luego «+N». No salen en un piso en rojo (lo ocupa el bocadillo).
- **Avería** (2026-10-24): si la última respuesta fue un error de la API, cartel oscuro con franja de obra naranja y «AVERÍA · tipo» en lugar de la mesa. No es un color de estado: el chip conserva el estado y el rojo sigue reservado a «te necesita».
- **Indicador de contexto** (2026-10-24): placa oscura de 32 × 20 px bajo las iniciales con barra y porcentaje; gris, ámbar desde el 70 % y naranja con «!» desde el 85 %.
- **Rebobinar** (2026-10-24): botón en la navegación y barra fija abajo a la derecha (fondo oscuro, borde de acento): día, Reproducir/Pausa, deslizador, hora grande y «Volver al directo». Mientras está abierta, la ciudad muestra el pasado y no hay avisos.
- **Piso en venta**: placa clara con el cartel «EN VENTA».
- **Barra de estado**: chips con un punto de color y el número. A la derecha, el botón «Activar avisos» (gris y desactivado cuando ya están activados o bloqueados) y el buscador.
- **Panel de detalle**: cabecera (título, estado, modelo y última actividad), bloque acumulado de la sesión (coste, tokens, comandos, lecturas, acciones web y archivos), gráfico semanal de barras, respuestas rápidas, botón «Copiar y abrir sesión» y bitácora.

## Vida ambiental y puentes

- Dos edificios del mismo proyecto, uno por proveedor, se marcan automáticamente con el mismo banderín. Los nombres iguales de repositorios distintos no crean relaciones.
- En Puentes se pueden relacionar proyectos diferentes o quitar vínculos manuales. El vínculo une los grupos y comparten banderín; los datos se guardan solo en este navegador.
- Banderines en lugar de pasarelas (2026-10-24): los edificios relacionados llevan en la azotea un gallardete pixel del mismo color; cada grupo tiene el suyo (turquesa, rosa, azul, violeta, cobre, verde azulado; ninguno es color de estado). No se dibujan líneas por el mapa: las pasarelas largas mareaban. El menú sigue llamándose «Puentes».
- Prioridad del indicador del edificio: te necesita → trabajando → para revisar → dormida. Las ventanas mantienen los estados individuales de sus sesiones.
- Animación: coches por calles, personajes en pisos trabajando, brillo suave de peticiones pendientes. No se reconstruye la geometría del mapa en cada frame.
- Fachada con entorno: detrás, sol, nubes y skyline lejano en azules claros con ventanas encendidas (no compite con los estados); a los lados, árboles, farolas y bancos fuera de la huella del edificio; delante, peatones por la acera y coches por la calzada. Decorado determinista (`tower/scenery.ts`), sin cambiar al redibujar.
- Vida permite detener el movimiento; `prefers-reduced-motion` lo detiene también, incluida la avioneta, que conserva una pancarta estática. Pestaña oculta: ticker detenido. La información, estados y avisos siguen disponibles.

## Pantallas principales
1. Mapa de ciudad, con barrios Claude y Codex.
2. Barrio seleccionado, edificios y puentes.
3. Fachada del proyecto/proveedor con sesiones por pisos y panel de detalle.
4. Panel de relaciones manuales.
5. Sin sesiones: barrios vacíos, sin edificios ni métricas inventadas.

## Pantallas pequeñas
Pensado para escritorio. En ventanas estrechas, el panel se superpone a la torre en lugar de empujarla.

## Accesibilidad
Contraste AA en el panel y en la barra; estados con icono y texto además del color; el panel se puede usar con el teclado (Esc para cerrar).

## Qué hacer y qué no
- Sí: priorizar la lectura de los estados; animaciones discretas.
- No: añadir decoración del video (palomas, dinosaurio) en el MVP; la avioneta de lo urgente es la excepción aceptada; usar sprites o logos de terceros.

## Preguntas de diseño abiertas
- La fuente pixel («Press Start 2P») está pendiente de cargar en local; por ahora se usa la pila monoespaciada del sistema.
- Si se generan sprites propios a mano o con IA para el interior de los pisos.
