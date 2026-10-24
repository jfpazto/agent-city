# Spec: urgent-selector

## Origen

- Feature: `urgent-selector` (front). Sin dependencias.
- Comportamiento: un piso es urgente cuando lleva más de 1 minuto seguido en `te_necesita`; deja de serlo al salir de rojo. Es la base de `urgent-plane` y `urgent-notification`.
- Verificación: tests vitest de la función pura (59 s no, 61 s sí, salir y volver = episodio nuevo, snapshot inicial con `lastEventAt`).

## Objetivo

Saber, en el front y sin tocar el colector, qué sesiones llevan demasiado tiempo esperando al usuario.

## Fuera de alcance

Dibujar nada (avioneta) o avisar (notificación); cambiar `Session` o el colector.

## Historia

Cuando una sesión me lleva esperando más de un minuto, quiero que la ciudad lo sepa para avisarme, sin molestarme por esperas de segundos.

## Escenarios

- Dado un piso que pasa a rojo a las 10:00:00, cuando son las 10:00:59, no es urgente; a las 10:01:01, sí.
- Dado un piso urgente, cuando pasa a otro estado, deja de serlo; si vuelve a rojo, el minuto empieza de nuevo (episodio nuevo).
- Dado el primer estado que ve el front (snapshot) con un piso ya en rojo, el inicio del rojo es su `lastEventAt`.
- Dado un piso en rojo, cuando llega otro evento suyo sin salir de rojo, el inicio no cambia.

## Investigación

`Session` (`shared/src`) no trae «desde cuándo en rojo», solo `state` y `lastEventAt`. `connectState` entrega la lista completa en cada cambio, sin distinguir snapshot de actualización; por eso la regla es por sesión: si es la primera vez que el front ve la sesión, se usa `lastEventAt`; si ya la conocía en otro estado, la hora de la transición.

## Diseño técnico

`web/src/urgent/urgent.ts`, puro:

- `URGENT_MS = 60_000`.
- `RedTracker = { redSince: Map<id, ms>; known: Set<id> }`, `emptyTracker()`.
- `trackRed(tracker, sessions, now)` → tracker nuevo (no muta).
- `urgentSessions(sessions, tracker, now, thresholdMs = URGENT_MS)` → sesiones con `now - redSince > thresholdMs`, la más antigua en rojo primero.
- `urgentThreshold(search, dev)`: `?urgentMs=N` solo en desarrollo (para pruebas sin esperar); en producción siempre 60 s.

`main.ts` mantiene un tracker, lo actualiza en cada cambio de sesiones y calcula urgentes cada segundo (el paso del minuto no llega por WS).

## Archivos

`web/src/urgent/urgent.ts`, `web/test/urgent.test.ts`, `web/src/main.ts`.

## Documentación duradera

`ARCHITECTURE.md`: añadir `web/src/urgent/`. `docs/pruebas-manuales.md`: se documenta con la avioneta (no hay nada visible aún). `DESIGN.md`, `AGENTS.md`: no.

## Tareas

1. Funciones puras y tests.
2. Integrar el tracker en `main.ts`.
3. `./init.sh`.

## Verificación

- `./init.sh` en verde con los casos de arriba.

## Checklist del validador

- [ ] 59 s no urgente, 61 s urgente.
- [ ] Salir de rojo y volver reinicia el minuto.
- [ ] Snapshot usa `lastEventAt`; transición usa la hora de verla.
- [ ] Umbral de 60 s fuera de desarrollo.
