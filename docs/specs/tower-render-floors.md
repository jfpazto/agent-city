# Spec de implementación: torre con un piso por sesión

## Feature de origen

- `id`: tower-render-floors
- `area`: front
- `depends_on`: ws-state-stream (accepted)
- `status`: not_started
- `source`: `feature_list.json`

## Objetivo

Sustituir el texto de depuración del front por la primera vista real de la Ciudad: una torre pixel art de dos columnas, con un piso por sesión (placa con iniciales y título) y pisos «EN VENTA» para completar. Cada sesión aparece siempre en su planta asignada por el colector. Es la base visual sobre la que se pintarán los colores de estado, el bocadillo, el scroll y el panel de detalle.

## Fuera de alcance

- Colores de estado, parpadeo e iconos (`floor-state-colors`). Aquí todos los pisos ocupados usan `floorDark` y una etiqueta de estado en texto plano solo como ayuda provisional.
- Bocadillo de mensaje (`needs-you-bubble`), scroll y zoom (`tower-scroll-zoom`), barra de estado (`status-bar-counters`), clic y panel (`detail-panel-metrics`).
- Sprites o imágenes externas: todo se dibuja con `Graphics` y `Text` de Pixi.
- Animaciones.

## Historia de trabajo

Cuando abro la Ciudad,
quiero ver mis sesiones como pisos de un edificio, cada una en su sitio,
para reconocerlas de un vistazo y que no cambien de lugar.

## Usuarios y permisos

- El autor, en local. Sin cambios en el colector.

## Reglas de disposición (contrato)

Función pura `layoutTower(sessions, viewport) → TowerLayout` en `web/src/tower/layout.ts`:

- Medidas (de `DESIGN.md`): piso de `180 × 96` px, `4` px de marco, hueco de ascensor de `40` px entre las dos columnas, suelo de `48` px.
- **Plantas**: la planta `f` de una sesión ocupa la fila `row = floor(f / 2)` y la columna `col = f % 2` (0 = izquierda, 1 = derecha). La fila 0 está pegada al suelo y las siguientes van hacia arriba.
- **Filas visibles**: `max(4, filaMásAlta + 2)`. Siempre hay al menos una fila completa libre arriba. Las celdas sin sesión son «EN VENTA».
- **Posición**: la torre se centra en horizontal. El suelo queda en el borde inferior del viewport. Si la torre no cabe en altura, se recorta por arriba (el scroll llegará con `tower-scroll-zoom`).
- **Iniciales**: hasta 2 letras en mayúscula del título: la primera letra de las dos primeras palabras (separadas por espacio, `-` o `_`); si solo hay una palabra, sus dos primeras letras. Si no hay letras, `??`.
- **Título**: recortado con «…» a 18 caracteres.

```ts
type FloorCell =
  | { kind: "session"; floor: number; x: number; y: number; w: number; h: number; initials: string; title: string; state: SessionState; id: string }
  | { kind: "for_sale"; floor: number; x: number; y: number; w: number; h: number };
type TowerLayout = { cells: FloorCell[]; tower: { x: number; y: number; w: number; h: number }; groundY: number };
```

## Escenarios de aceptación

### Escenario 1: tres sesiones
Dadas sesiones en las plantas 0, 1 y 2
cuando se calcula la disposición
entonces la planta 0 está abajo a la izquierda, la 1 abajo a la derecha y la 2 en la segunda fila a la izquierda. Se ven 4 filas (8 celdas): 3 ocupadas y 5 «EN VENTA».

### Escenario 2: huecos
Dadas sesiones en las plantas 0 y 5 (la 1-4 libres)
cuando se calcula la disposición
entonces las plantas 1 a 4 son «EN VENTA» y la 5 está en la fila 2, columna derecha. Se ven `max(4, 2+2) = 4` filas.

### Escenario 3: muchas sesiones
Dada una sesión en la planta 13 (fila 6)
cuando se calcula la disposición
entonces se ven 8 filas.

### Escenario 4: iniciales y títulos
- «FrontAgentico» → `FR`
- «agente linkedin» → `AL`
- «kodo-agents» → `KA`
- «123» → `??`
- un título de 30 caracteres → recortado a 18 con «…».

### Escenario 5: en vivo y estable
Dado el front abierto con el colector arrancado
cuando una sesión nueva envía `SessionStart` y otra termina con `SessionEnd`
entonces aparece un piso nuevo en la planta libre más baja y el piso de la que terminó pasa a «EN VENTA». Los demás pisos no se mueven. Al recargar la página, cada sesión vuelve a la misma planta.

### Escenario 6: redimensionar
Dado el front abierto
cuando cambia el tamaño de la ventana
entonces la torre se vuelve a centrar y el suelo sigue en el borde inferior.

## Investigación del repositorio

### Archivos revisados
- `packages/web/src/main.ts`: `Application` de Pixi v8 y el texto de depuración que se sustituye.
- `packages/web/src/stateClient.ts`: `connectState(url, onChange, onStatus)` entrega `Session[]` ordenadas por planta.
- `packages/web/test/stateClient.test.ts`: patrón de test del paquete web (vitest en node, funciones puras).
- `packages/shared/src/index.ts`: `Session` y `SessionState`.
- `DESIGN.md`: colores, medidas, tipografía y píxel duro.
- `docs/domain-model.md`: plantas asignadas por el colector (libre más baja, se liberan con `SessionEnd`).

### Lo que falta
- No hay fuentes web cargadas: se usará la pila monoespaciada del sistema (`JetBrains Mono, ui-monospace, monospace`). «Press Start 2P» queda como mejora posterior; no se descarga de un CDN en esta feature.

## Enfoque técnico

- `web/src/tower/layout.ts`: `layoutTower`, `initials` y `truncate`, puras y testeadas.
- `web/src/tower/TowerView.ts`: clase con un `Container` raíz y el método `update(sessions, viewport)`:
  - Recalcula la disposición y redibuja (borrar y volver a crear los hijos es aceptable con menos de 100 pisos).
  - Fondo del cielo: el `background` de la app. Suelo: rectángulo `ground` a todo el ancho.
  - Estructura: rectángulo `towerFrame` y hueco de ascensor más oscuro entre columnas.
  - Piso ocupado: rectángulo `floorDark`; recuadro de iniciales `accent` de 32 × 32 px arriba a la izquierda con las iniciales en blanco; título en `panelText` abajo; etiqueta provisional del estado en texto pequeño.
  - Piso «EN VENTA»: rectángulo `floorEmpty` con un cartel oscuro centrado «EN VENTA» en texto claro.
  - Todo en coordenadas enteras (`roundPixels` ya está activo).
- `main.ts`: quitar el texto de depuración. Crear `TowerView`, añadirlo al `stage` y llamar a `update` en cada `onChange` y en `app.renderer.on("resize")`. El estado de conexión se muestra en una línea pequeña abajo a la izquierda, sobre el suelo («colector: conectado»).
- **Modo demo** para verificar sin el colector: si la URL tiene `?demo=N`, no se conecta al WebSocket y se pintan `N` sesiones inventadas («demo 1», «demo 2»…) en las plantas `0..N-1`, con estados rotando. Solo sirve para capturas.

## Archivos previstos

- `packages/web/src/tower/layout.ts`: crear.
- `packages/web/src/tower/TowerView.ts`: crear.
- `packages/web/src/main.ts`: modificar.
- `packages/web/test/layout.test.ts`: crear; escenarios 1 a 4.
- `ARCHITECTURE.md`: actualizar (estructura del front).
- `feature_list.json`, `PROGRESS.md`: evidencia.

## Impacto visual

- Hay interfaz: sí, la vista principal.
- Fuente: `DESIGN.md` (colores, medidas y píxel duro). No hay recursos externos.
- Estados afectados: torre vacía (solo «EN VENTA»), con sesiones, con huecos y al redimensionar.
- Hace falta un artefacto de diseño nuevo: no. Las capturas quedan como evidencia.

## Impacto en la documentación

- `ARCHITECTURE.md`: añadir una línea: el front separa la disposición pura (`tower/layout.ts`) del dibujo (`tower/TowerView.ts`); las plantas vienen del colector.
- `DESIGN.md`: no hace falta, salvo anotar en «Preguntas de diseño abiertas» que la fuente pixel está pendiente de cargar.
- `CONSTRAINTS.md` y `AGENTS.md`: no hace falta.

## Plan de implementación

1. `layout.ts` con sus tests (escenarios 1 a 4).
2. `TowerView.ts` con el dibujo.
3. Conexión en `main.ts`, modo demo y redimensionado.
4. Capturas: `?demo=3`, `?demo=0` y sesiones reales.
5. Docs, evidencia y commit.

## Tareas

- [ ] `initials` y `truncate`.
- [ ] `layoutTower` con filas, columnas, filas visibles y centrado.
- [ ] Tests de disposición.
- [ ] `TowerView`: suelo, estructura, ascensor, piso ocupado y piso «EN VENTA».
- [ ] `main.ts`: sustituir el texto de depuración, línea de conexión, redimensionado.
- [ ] Modo `?demo=N`.
- [ ] Capturas y comprobación en vivo (escenario 5).
- [ ] `ARCHITECTURE.md` y `DESIGN.md` (pregunta abierta).
- [ ] Evidencia y commit.

## Plan de verificación

- `./init.sh` → typecheck y todos los tests en verde.
- Con Vite arrancado, abrir `http://localhost:5173/?demo=3` con el panel del navegador **visible** (si está oculto, Pixi no repinta): captura con 3 pisos ocupados y 5 «EN VENTA», sin errores en la consola.
- `?demo=0`: torre vacía de 4 filas «EN VENTA».
- `?demo=14`: 8 filas; si no caben, se recortan por arriba sin errores.
- Sin `?demo`: aparecen las sesiones reales. Enviar `SessionStart` y `SessionEnd` sintéticos con `send.sh` y comprobar el escenario 5. Recargar y comprobar que las plantas se mantienen.
- Redimensionar con `resize_window` (escritorio y 768 px) y comprobar el escenario 6.
- E2E: no hay harness. Bastan los tests de la disposición pura y las capturas.

## Evidencia a guardar

- Salida de `./init.sh`.
- Capturas de `?demo=3` y de las sesiones reales.
- Resultado del escenario 5 (antes y después del `SessionEnd`, y tras recargar).

## Checklist del validador

- [ ] La disposición es pura, está testeada y coincide con las reglas.
- [ ] Las sesiones salen en su planta del colector y no se reordenan.
- [ ] Siempre hay al menos una fila «EN VENTA» arriba.
- [ ] Colores y medidas salen de `DESIGN.md`; no hay assets externos ni CDN.
- [ ] No se añadieron colores de estado, scroll, clic ni panel.
- [ ] El modo demo no se conecta al colector.
