import { Application, Graphics, Text, TextureSource } from "pixi.js";
import type { Session, SessionState, UsageLimits, HistoryResponse } from "@ciudad/shared";
import { connectState, type ConnectionStatus } from "./stateClient.ts";
import { TowerView } from "./tower/TowerView.ts";
import { StatusBar } from "./hud/StatusBar.ts";
import { centerOn, clampCamera, scrollBy, wheelZoomFactor, worldBounds, zoomAt, type Camera } from "./tower/camera.ts";
import { matchSessions, nextMatch } from "./hud/search.ts";
import { DetailPanel } from "./panel/DetailPanel.ts";
import { forSaleAt, isSwipe, onBuilding, openButtonAt, sessionAt, SWIPE_DELETE } from "./panel/model.ts";
import type { CityLayout } from "./tower/city.ts";
import { bannerText, emptyTracker, trackRed, urgentSessions, urgentThreshold } from "./urgent/urgent.ts";
import { PlaneView } from "./urgent/PlaneView.ts";
import { playChime, soundButtonText } from "./urgent/sound.ts";
import { decideFinished, decideNotify, finishedContent, notificationContent, notifyButton, type Permission } from "./urgent/notify.ts";
import { MapView } from "./world/MapView.ts";
import { WorldUI } from "./world/WorldUI.ts";
import { buildingAt, groupBuildings, layoutWorld, recencySlots, registerSlots, type Rect, type Relation } from "./world/model.ts";
import { clampMap, fitMap, mapPoint, zoomMap } from "./world/camera.ts";
import { loadPreferences, savePreferences } from "./world/preferences.ts";
import { demoUsage, usageView } from "./world/usage.ts";
import { firstBusyFrame, frameSessions, frameTime, replayDays } from "./world/replay.ts";

// Los gráficos son vectoriales (siguen pixelados con antialias: false); las únicas texturas son textos,
// que con suavizado y al doble de densidad mantienen las letras nítidas también con zoom.
TextureSource.defaultOptions.scaleMode = "linear";
const app = new Application();
await app.init({ background: "#AEC5A2", resizeTo: window, roundPixels: true, antialias: false, resolution: Math.max(2, window.devicePixelRatio || 1), autoDensity: true });
document.body.appendChild(app.canvas);
app.ticker.maxFPS = 30;

const backdrop = new Graphics(), mapView = new MapView(), tower = new TowerView();
app.stage.addChild(backdrop, mapView.root, tower.root);
const footer = new Graphics();
const statusText = new Text({ text: "", style: { fontFamily: "ui-monospace, monospace", fontSize: 10, fill: "#C4D2E4" } });
statusText.anchor.set(1, 0);
app.stage.addChild(footer, statusText);
const plane = new PlaneView(), statusBar = new StatusBar();
app.stage.addChild(plane.root, statusBar.root);

const params = new URLSearchParams(location.search), demo = params.get("demo");
// Las pruebas demo tienen su propio espacio: nunca escriben sobre las relaciones de proyectos reales.
let storage: Pick<Storage, "getItem" | "setItem"> | undefined;
try {
  const local = window.localStorage;
  storage = { getItem: (key) => local.getItem(key + (demo !== null ? ".demo" : "")), setItem: (key, value) => local.setItem(key + (demo !== null ? ".demo" : ""), value) };
} catch { /* Almacenamiento bloqueado: todo funciona en memoria. */ }
const preferences = loadPreferences(storage);
const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
const animated = () => preferences.motion && !reducedMotion.matches;
const persist = () => savePreferences(preferences, storage);

let status: ConnectionStatus | "demo" = "conectando";
let sessions: Session[] = [];
let groups = groupBuildings(sessions);
let world = layoutWorld(groups, preferences.slots);
let selectedBuilding: string | null = null;
let districtFocus: "all" | "claude" | "codex" = "all";
let mapCamera: Camera | null = null;
let frontCamera: Camera = { x: 0, y: 0, zoom: 1 };
let layout: CityLayout | null = null;
let lastMapViewport: Rect | null = null;
let dataFitted = false;
let mapSignature = "";
let rendering = false;
let hadSessions = false;
let usageLimits: UsageLimits[] = [];
let usageSignature = "";
/** Modo rebobinar: el día cargado, el fotograma visible y el temporizador de reproducción. Las sesiones en vivo siguen llegando a `liveSessions`. */
let replay: { h: HistoryResponse; index: number; timer?: ReturnType<typeof setInterval> } | null = null;
let liveSessions: Session[] = [];
const navigationHint = () => `${demo !== null ? "Demostración · " : ""}${sessions.length ? "Arrastra para recorrer · rueda para acercar · elige un edificio" : "Aún no hay sesiones en la ciudad"}`;

const collectorWs = import.meta.env.VITE_COLLECTOR_WS ?? "ws://127.0.0.1:4317/ws";
const collectorHttp = collectorWs.replace(/^ws/, "http").replace(/\/ws$/, "");
const searchInput = document.querySelector<HTMLInputElement>("#search")!;
const searchResult = document.querySelector<HTMLOutputElement>("#search-result")!;
const searchOpen = document.querySelector<HTMLButtonElement>("#search-open")!;
const panel = new DetailPanel(() => render());
const ui = new WorldUI({
  focus: focusDistrict, enter: enterBuilding, session: openPanel, back: backToMap, zoom: zoomCurrent,
  setRelations: (relations: Relation[]) => { preferences.relations = relations; const saved = persist(); render(); return saved; },
  setMotion: (motion: boolean) => { preferences.motion = motion; persist(); render(); ui.announce(motion ? "Movimiento activado" : "Movimiento detenido"); },
});

function mapViewport(): Rect {
  const top = Math.ceil(ui.toolbar.getBoundingClientRect().bottom) + 10;
  return { x: 0, y: top, w: app.screen.width, h: Math.max(80, app.screen.height - top - 34) };
}
function frontViewport() {
  const panelWidth = panel.openId && app.screen.width >= 650 ? Math.min(360, app.screen.width) : 0;
  // La barra inferior (28 px) no tapa la calzada ni sus coches.
  return { width: app.screen.width - panelWidth, height: app.screen.height - 28 };
}
function applyCamera(): void {
  if (!selectedBuilding) {
    const viewport = mapViewport();
    mapCamera = clampMap(mapCamera ?? fitMap(world.bounds, viewport), world.bounds, viewport);
    mapView.root.position.set(Math.round(mapCamera.x), Math.round(mapCamera.y));
    mapView.root.scale.set(mapCamera.zoom);
    mapView.setZoom(mapCamera.zoom);
    const highlighted = groups.find((g) => g.sessions.some((s) => s.id === tower.highlightId))?.id ?? null;
    ui.positionLabels(mapCamera, viewport, highlighted);
  } else if (layout) {
    const viewport = frontViewport(), bounds = worldBounds(layout.tower.y, viewport);
    bounds.top = Math.min(bounds.top, layout.tower.y - mapViewport().y - 16);
    frontCamera = clampCamera(frontCamera, bounds, viewport);
    tower.root.position.set(Math.round(frontCamera.x), Math.round(frontCamera.y));
    tower.root.scale.set(frontCamera.zoom);
  }
}
function focusDistrict(provider: "all" | "claude" | "codex"): void {
  selectedBuilding = null;
  tower.highlightId = null;
  districtFocus = provider;
  panel.close(false);
  render();
  const target = provider === "all" ? world.bounds : world.districts.find((d) => d.provider === provider)!;
  mapCamera = fitMap(target, mapViewport());
  applyCamera();
  const district = world.districts.find((d) => d.provider === provider);
  ui.announce(district ? `Barrio ${provider === "claude" ? "Claude" : "Codex"} · ${district.count} proyectos · ${district.sessions} sesiones` : `Ciudad · ${world.buildings.length} edificios · ${sessions.length} sesiones`);
}
function enterBuilding(id: string): void {
  const group = groups.find((g) => g.id === id);
  if (!group) return;
  if (selectedBuilding !== id) frontCamera = { x: 0, y: 0, zoom: 1 };
  selectedBuilding = id;
  tower.highlightId = null;
  panel.close(false);
  render();
  document.querySelector<HTMLSelectElement>("#floor-picker")!.focus({ preventScroll: true });
  ui.announce(`${group.project.name} · ${group.provider === "claude" ? "Claude" : "Codex"} · ${group.sessions.length} sesiones`);
}
function backToMap(): void {
  const previous = selectedBuilding;
  selectedBuilding = null;
  tower.highlightId = null;
  panel.close(false);
  render();
  if (previous) ui.focusBuilding(previous);
  ui.announce("De vuelta al mapa · posición conservada");
}
function revealSession(id: string, open: boolean): void {
  const group = groups.find((g) => g.sessions.some((s) => s.id === id));
  if (!group) return;
  if (selectedBuilding !== group.id) frontCamera = { x: 0, y: 0, zoom: 1 };
  selectedBuilding = group.id;
  tower.highlightId = id;
  if (open) panel.open(id, sessions);
  else panel.close(false);
  render();
  const cell = layout?.cells.find((c) => c.kind === "session" && c.id === id);
  if (cell) {
    frontCamera = centerOn(frontCamera, cell, frontViewport());
    applyCamera();
  }
}
/** ▶ del piso: el colector abre la sesión en la app de escritorio o, si no está ahí, en Terminal. */
function openSession(id: string): void {
  if (replay) return ui.announce("Estás viendo el pasado: vuelve al directo para abrir sesiones");
  const session = sessions.find((s) => s.id === id);
  const title = session?.title ?? "la sesión";
  const app = session?.agent === "codex" ? "la app de Codex" : "la app de Claude";
  if (demo !== null) return ui.announce(`Demostración: aquí se abriría «${title}» en ${app}`);
  ui.announce(`Abriendo «${title}»…`);
  fetch(`${collectorHttp}/sessions/${encodeURIComponent(id)}/open`, { method: "POST" })
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (res.ok) return ui.announce(body?.openedIn === "desktop" ? `«${title}» abierta en ${app}` : `«${title}» abierta en Terminal`);
      const error = body?.error;
      ui.announce(error === "not_resumable" ? "Esta sesión no se puede reanudar desde aquí" : "No se pudo abrir la sesión");
    })
    .catch(() => ui.announce("No se pudo abrir la sesión: ¿está el colector encendido?"));
}
/** Piso «en venta»: abre una sesión nueva del mismo agente en la carpeta del proyecto. */
function newSessionHere(): void {
  if (replay) return ui.announce("Estás viendo el pasado: vuelve al directo para crear sesiones");
  const group = groups.find((g) => g.id === selectedBuilding);
  const ref = group?.sessions[0];
  if (!group || !ref) return;
  const app = group.provider === "codex" ? "la app de Codex" : "la app de Claude";
  if (demo !== null) return ui.announce(`Demostración: aquí se abriría una sesión nueva de ${group.project.name} en ${app}`);
  ui.announce(`Abriendo una sesión nueva en ${group.project.name}…`);
  fetch(`${collectorHttp}/sessions/${encodeURIComponent(ref.id)}/new`, { method: "POST" })
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (res.ok) return ui.announce(`Sesión nueva de ${group.project.name} abierta en ${body?.openedIn === "desktop" ? app : "Terminal"}`);
      ui.announce(body?.error === "no_folder" ? "Este proyecto no tiene carpeta conocida" : "No se pudo abrir la sesión nueva");
    })
    .catch(() => ui.announce("No se pudo abrir la sesión nueva: ¿está el colector encendido?"));
}

/** Deslizar a la derecha: confirma y manda la sesión a la papelera (recuperable desde el Finder). */
function deleteSession(id: string): void {
  const s = sessions.find((x) => x.id === id);
  if (!s) return;
  if (replay) return ui.announce("Estás viendo el pasado: vuelve al directo para eliminar sesiones");
  if (s.state === "trabajando" || s.state === "te_necesita") return ui.announce("No se puede eliminar una sesión activa; espera a que termine");
  if (!confirm(`¿Eliminar la sesión «${s.title}»?\n\nSu conversación se moverá a la Papelera; el proyecto y sus otras sesiones no se tocan.`)) return;
  if (demo !== null) {
    sessions = sessions.filter((x) => x.id !== id);
    render();
    return ui.announce(`Demostración: «${s.title}» eliminada`);
  }
  fetch(`${collectorHttp}/sessions/${encodeURIComponent(id)}/delete`, { method: "POST" })
    .then(async (res) => {
      const body = await res.json().catch(() => null);
      if (res.ok) return ui.announce(`«${s.title}» eliminada (está en la Papelera)`);
      ui.announce(body?.error === "session_busy" ? "No se puede eliminar una sesión activa" : "No se pudo eliminar la sesión");
    })
    .catch(() => ui.announce("No se pudo eliminar la sesión: ¿está el colector encendido?"));
}

function openPanel(id: string): void {
  revealSession(id, true);
  const s = sessions.find((s) => s.id === id);
  // En el pasado solo se mira: abrir el panel no marca nada como revisado.
  if (replay || s?.state !== "para_revisar") return;
  if (demo !== null) {
    sessions = sessions.map((s) => s.id === id ? { ...s, state: "dormida" } : s);
    render();
    return;
  }
  fetch(`${collectorHttp}/sessions/${encodeURIComponent(id)}/reviewed`, { method: "POST" })
    .then((res) => { if (!res.ok) console.warn(`[ciudad] el colector no marcó la sesión como revisada (${res.status})`); })
    .catch((err) => console.warn("[ciudad] no se pudo marcar como revisada", err));
}
function zoomCurrent(factor: number): void {
  if (selectedBuilding) {
    const viewport = frontViewport();
    frontCamera = zoomAt(frontCamera, factor, viewport.width / 2, (mapViewport().y + viewport.height) / 2);
  } else {
    const viewport = mapViewport();
    mapCamera = zoomMap(mapCamera ?? fitMap(world.bounds, viewport), factor, { x: viewport.w / 2, y: viewport.y + viewport.h / 2 });
  }
  applyCamera();
}

// El buscador y lo urgente comparten la entrada al edificio y el centrado del piso.
function updateSearchStatus(): void {
  const matches = matchSessions(sessions, searchInput.value), id = tower.highlightId;
  searchResult.value = !searchInput.value.trim() ? "" : matches.length === 0 ? "sin pisos" : `${Math.max(0, matches.indexOf(id ?? "")) + 1}/${matches.length}`;
  searchOpen.hidden = !id || !sessions.some((s) => s.id === id);
}
function showMatch(id: string | null): void {
  tower.highlightId = id;
  if (id) revealSession(id, false);
  else render();
  updateSearchStatus();
}
function refreshSearch(): void {
  if (!searchInput.value.trim()) return;
  const matches = matchSessions(sessions, searchInput.value);
  if (tower.highlightId && matches.includes(tower.highlightId)) return updateSearchStatus();
  showMatch(matches[0] ?? null);
}
searchOpen.addEventListener("click", () => { if (tower.highlightId) openPanel(tower.highlightId); });
searchInput.addEventListener("input", () => showMatch(matchSessions(sessions, searchInput.value)[0] ?? null));
searchInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") showMatch(nextMatch(matchSessions(sessions, searchInput.value), tower.highlightId));
  if (e.key === "Escape") {
    e.stopPropagation();
    if (!searchInput.value && panel.openId) return panel.close();
    searchInput.value = "";
    showMatch(null);
    searchInput.blur();
  }
});
const textEntry = (target: EventTarget | null) => target instanceof HTMLElement && (target.isContentEditable || target.matches("input,textarea,select"));
window.addEventListener("keydown", (e) => {
  if (e.key === "/" && !textEntry(e.target)) { e.preventDefault(); searchInput.focus(); }
  if (e.key === "Escape") {
    if (ui.bridgesOpen) ui.closeBridges();
    else if (panel.openId) panel.close();
    else if (selectedBuilding && !textEntry(e.target)) backToMap();
  }
});

app.canvas.style.touchAction = "none";
let downAt: { x: number; y: number; camera: Camera; pointerId: number; floor: string | null; mode?: "pan" | "swipe" } | null = null;
let dragging = false;
app.canvas.addEventListener("pointerdown", (e) => {
  if (e.button !== 0) return;
  const floor = selectedBuilding && layout && !openButtonAt(layout, frontCamera, e.offsetX, e.offsetY) ? sessionAt(layout, frontCamera, e.offsetX, e.offsetY) : null;
  downAt = { x: e.offsetX, y: e.offsetY, camera: { ...(selectedBuilding ? frontCamera : mapCamera!) }, pointerId: e.pointerId, floor };
  dragging = false;
  app.canvas.setPointerCapture(e.pointerId);
});
app.canvas.addEventListener("pointermove", (e) => {
  if (downAt?.pointerId === e.pointerId) {
    const dx = e.offsetX - downAt.x, dy = e.offsetY - downAt.y;
    if (dragging || Math.hypot(dx, dy) > 4) {
      dragging = true;
      // Al empezar el arrastre se decide: deslizar un piso a la derecha (eliminar) o mover la vista.
      downAt.mode ??= downAt.floor && isSwipe(dx, dy) ? "swipe" : "pan";
      if (downAt.mode === "swipe") {
        tower.slide(downAt.floor!, dx / frontCamera.zoom, SWIPE_DELETE / frontCamera.zoom);
        app.canvas.style.cursor = "grabbing";
        return;
      }
      const next = { ...downAt.camera, x: downAt.camera.x + dx, y: downAt.camera.y + dy };
      if (selectedBuilding) frontCamera = next; else mapCamera = next;
      applyCamera();
      app.canvas.style.cursor = "grabbing";
      return;
    }
  }
  if (plane.hitsBanner(e.offsetX, e.offsetY)) { app.canvas.style.cursor = "pointer"; return; }
  const hit = selectedBuilding ? layout && (sessionAt(layout, frontCamera, e.offsetX, e.offsetY) || forSaleAt(layout, frontCamera, e.offsetX, e.offsetY))
    : mapCamera && buildingAt(world, mapPoint(mapCamera, { x: e.offsetX, y: e.offsetY }));
  app.canvas.style.cursor = hit ? "pointer" : "grab";
});
app.canvas.addEventListener("pointerup", (e) => {
  if (!downAt || downAt.pointerId !== e.pointerId) return;
  const moved = dragging || Math.hypot(e.offsetX - downAt.x, e.offsetY - downAt.y) > 4;
  const swiped = downAt.mode === "swipe" ? { id: downAt.floor!, dx: e.offsetX - downAt.x } : null;
  downAt = null; dragging = false;
  if (app.canvas.hasPointerCapture(e.pointerId)) app.canvas.releasePointerCapture(e.pointerId);
  app.canvas.style.cursor = "grab";
  if (swiped) {
    tower.slide(swiped.id, 0, SWIPE_DELETE);
    if (swiped.dx >= SWIPE_DELETE) deleteSession(swiped.id);
    return;
  }
  if (moved) return;
  if (plane.hitsBanner(e.offsetX, e.offsetY)) { if (urgent[0]) revealSession(urgent[0].id, false); return; }
  if (selectedBuilding && layout) {
    const resume = openButtonAt(layout, frontCamera, e.offsetX, e.offsetY);
    if (resume) return openSession(resume);
    const id = sessionAt(layout, frontCamera, e.offsetX, e.offsetY);
    if (id) openPanel(id);
    else if (forSaleAt(layout, frontCamera, e.offsetX, e.offsetY)) newSessionHere();
    else if (!onBuilding(layout, frontCamera, e.offsetX, e.offsetY)) backToMap();
    else panel.close();
  } else if (mapCamera) {
    const hit = buildingAt(world, mapPoint(mapCamera, { x: e.offsetX, y: e.offsetY }));
    if (hit) enterBuilding(hit.id);
  }
});
const cancelDrag = () => { if (downAt?.mode === "swipe") tower.slide(downAt.floor!, 0, SWIPE_DELETE); downAt = null; dragging = false; app.canvas.style.cursor = "grab"; };
app.canvas.addEventListener("pointercancel", cancelDrag);
app.canvas.addEventListener("lostpointercapture", cancelDrag);
app.canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const dy = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY, dx = e.deltaMode === 1 ? e.deltaX * 16 : e.deltaX;
  if (!selectedBuilding) mapCamera = zoomMap(mapCamera!, Math.exp(-dy * 0.0015), { x: e.offsetX, y: e.offsetY });
  else frontCamera = e.ctrlKey || e.metaKey ? zoomAt(frontCamera, wheelZoomFactor(dy), e.offsetX, e.offsetY) : scrollBy(frontCamera, e.shiftKey ? 0 : dy, e.shiftKey ? dx || dy : dx);
  applyCamera();
}, { passive: false });

const urgentMs = urgentThreshold(location.search, import.meta.env.DEV);
let redTracker = emptyTracker(), urgent: Session[] = [], notified = new Set<string>(), lastStates = new Map<string, Session["state"]>(), statesReady = false;
const notifyBtn = document.querySelector<HTMLButtonElement>("#notify")!;
const permission = (): Permission => "Notification" in window ? Notification.permission : "unsupported";
function updateNotifyBtn(): void {
  const b = notifyButton(permission());
  notifyBtn.textContent = b.text; notifyBtn.disabled = b.disabled; notifyBtn.hidden = b.hidden; notifyBtn.title = b.help ?? "";
}
function showNotification(title: string, body: string, id: string): void {
  if (permission() !== "granted") return;
  try {
    const n = new Notification(title, { body });
    n.onclick = () => { window.focus(); revealSession(id, false); n.close(); };
  } catch (err) { console.warn("[ciudad] no se pudo mostrar el aviso", err); }
}
/** Señal de «lista para revisar»: avisa de las sesiones vivas que acaban de responder (trabajando → para revisar). */
function refreshFinished(): void {
  const r = decideFinished(lastStates, sessions);
  lastStates = r.states;
  // La primera instantánea solo fija el punto de partida: no avisa de lo que ya estaba terminado.
  if (!statesReady) { statesReady = sessions.length > 0 || demo !== null; return; }
  if (!r.finished.length) return;
  const { title, body } = finishedContent(r.finished);
  ui.announce(`✓ ${title}`);
  if (preferences.sound) playChime("finished");
  showNotification(title, body, r.finished[0].id);
}
notifyBtn.addEventListener("click", () => { if (permission() === "default") Notification.requestPermission().catch(() => undefined).finally(updateNotifyBtn); });
function refreshUrgent(): void {
  // Rebobinando no hay avioneta ni avisos: los estados son del pasado.
  if (replay) { plane.setText(""); return; }
  redTracker = trackRed(redTracker, sessions, Date.now());
  urgent = urgentSessions(sessions, redTracker, Date.now(), urgentMs);
  plane.setText(bannerText(urgent));
  const r = decideNotify(notified, urgent); notified = r.notified;
  refreshFinished();
  if (!r.notify.length) return;
  const { title, body } = notificationContent(r.notify);
  if (preferences.sound) playChime("urgent");
  showNotification(title, body, r.notify[0].id);
}
const soundBtn = document.querySelector<HTMLButtonElement>("#city-sound")!;
function updateSoundBtn(): void {
  soundBtn.textContent = soundButtonText(preferences.sound);
  soundBtn.setAttribute("aria-pressed", String(preferences.sound));
}
soundBtn.addEventListener("click", () => {
  preferences.sound = !preferences.sound;
  persist();
  updateSoundBtn();
  // El clic es el gesto que el navegador exige: una muestra confirma que se oye.
  if (preferences.sound) playChime("finished");
});
updateSoundBtn();
updateNotifyBtn();
setInterval(refreshUrgent, 1_000);
setInterval(() => panel.update(sessions), 5_000);

/** Depósito y central: se recalculan con el reloj (una recarga pasa sin que llegue ningún mensaje). */
function refreshUsage(): void {
  const now = new Date();
  const views = (["claude", "codex"] as const).map((p) => usageView(p, usageLimits.find((l) => l.provider === p), now));
  const signature = JSON.stringify([views, world.districts.map((d) => [d.x, d.y, d.w, d.h])]);
  if (signature === usageSignature) return;
  usageSignature = signature;
  mapView.setUsage(world.districts, views);
  ui.setUsage(views);
  if (mapCamera) applyCamera();
}
setInterval(refreshUsage, 30_000);

/**
 * Los mensajes del colector llegan a ráfagas (hasta ~11 eventos/s): se agrupan y se dibuja una vez cada 50 ms.
 * Temporizador y no requestAnimationFrame, que se detiene con la pestaña oculta y dejaría sin avisos.
 */
let renderTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleRender(): void {
  if (renderTimer) return;
  renderTimer = setTimeout(() => { renderTimer = undefined; render(); refreshSearch(); }, 50);
}

function render(): void {
  if (rendering) return;
  rendering = true;
  try {
    groups = groupBuildings(sessions);
    if (!!sessions.length !== hadSessions) { hadSessions = !!sessions.length; ui.announce(navigationHint()); }
    // Del más reciente al más antiguo trabajado; el registro de solares solo se conserva por compatibilidad.
    const slots = registerSlots(groups, preferences.slots);
    if (slots.claude.length !== preferences.slots.claude.length || slots.codex.length !== preferences.slots.codex.length) { preferences.slots = slots; persist(); }
    world = layoutWorld(groups, recencySlots(groups), preferences.relations);
    if (selectedBuilding && !groups.some((g) => g.id === selectedBuilding)) { selectedBuilding = null; panel.close(); ui.announce("El edificio ya no tiene sesiones; has vuelto al mapa."); }
    if (tower.highlightId && !sessions.some((s) => s.id === tower.highlightId)) tower.highlightId = null;
    panel.update(sessions);
    refreshUrgent();
    const current = groups.find((g) => g.id === selectedBuilding);
    backdrop.clear().rect(0, 0, app.screen.width, app.screen.height).fill(current ? "#9DC6E9" : "#AEC5A2");
    ui.update(world, selectedBuilding, districtFocus, preferences.relations, preferences.motion, reducedMotion.matches, panel.openId);
    const viewport = mapViewport();
    if (!mapCamera || (!dataFitted && sessions.length)) {
      mapCamera = fitMap(world.bounds, viewport);
      if (sessions.length) dataFitted = true;
    } else if (lastMapViewport) {
      mapCamera.x += (viewport.w - lastMapViewport.w) / 2;
      mapCamera.y += viewport.y + viewport.h / 2 - (lastMapViewport.y + lastMapViewport.h / 2);
    }
    lastMapViewport = viewport;
    mapView.root.visible = !current;
    tower.root.visible = !!current;
    const highlighted = groups.find((g) => g.sessions.some((s) => s.id === tower.highlightId))?.id ?? null;
    const signature = JSON.stringify([world.bounds, world.buildings.map((b) => b.slot), highlighted, preferences.relations, world.buildings.map((b) => [b.id, b.label, b.sessions.map((s) => [s.id, s.state])])]);
    if (signature !== mapSignature) { mapView.update(world, highlighted); mapSignature = signature; }
    refreshUsage();
    layout = current ? tower.update(current.sessions, frontViewport(), true) : null;
    applyCamera();
    footer.clear().rect(0, app.screen.height - 28, app.screen.width, 28).fill("#182235");
    statusText.text = `colector: ${status}`;
    statusText.position.set(app.screen.width - 12, app.screen.height - 19);
    statusBar.update(sessions, app.screen.width);
    plane.root.y = Math.max(0, viewport.y - 46);
    const panelEl = document.querySelector<HTMLElement>("#panel")!;
    panelEl.style.top = `${viewport.y}px`;
    const bridgesEl = document.querySelector<HTMLElement>("#city-relations")!;
    bridgesEl.style.top = `${viewport.y}px`;
    bridgesEl.style.maxHeight = `${Math.max(100, app.screen.height - viewport.y - 40)}px`;
    updateSearchStatus();
  } finally { rendering = false; }
}
app.renderer.on("resize", render);
new ResizeObserver(render).observe(ui.toolbar);
reducedMotion.addEventListener("change", render);
app.ticker.add(() => {
  const ms = performance.now(), motion = animated();
  if (mapView.root.visible) mapView.tick(ms, motion);
  if (tower.root.visible) tower.tick(ms, motion);
  plane.tick(ms, app.screen.width, motion);
});
document.addEventListener("visibilitychange", () => document.hidden ? app.ticker.stop() : app.ticker.start());

if (demo !== null) {
  const states: SessionState[] = ["trabajando", "te_necesita", "para_revisar", "dormida"];
  const n = Math.max(0, Math.min(500, Number.parseInt(demo, 10) || 0));
  const projectCount = Math.max(1, Math.min(n || 1, Number.parseInt(params.get("projects") ?? "4", 10) || 4));
  const names = ["Tienda online", "App del clima", "Blog de recetas", "Juego de ajedrez"];
  const title = ["Panel de métricas", "Permiso para Bash", "Revisión de cambios", "Preparar tareas"];
  const counts = new Map<string, number>();
  sessions = Array.from({ length: n }, (_, i) => {
    const agent = Math.floor(i / projectCount) % 2 ? "codex" as const : "claude" as const;
    const projectIndex = i % projectCount, key = `${agent}/${projectIndex}`, floor = counts.get(key) ?? 0;
    counts.set(key, floor + 1);
    return {
      id: `demo-${i}`, agent, title: `${title[i % title.length]} ${floor + 1}`, state: states[(i + Math.floor(i / projectCount)) % states.length], floor: i, projectFloor: floor,
      project: { id: `demo-project-${projectIndex}`, name: names[projectIndex] ?? `Proyecto ${projectIndex + 1}`, root: `/demo/proyecto-${projectIndex}`, order: projectIndex },
      lastEventAt: new Date().toISOString(), lastMessage: `Necesita tu permiso para usar Bash`,
      model: agent === "claude" ? "Claude (demo)" : "Codex (demo)", tokens: { input: 1_000 * (i + 1), output: 500, cacheRead: 20_000, cacheCreation: 3_000 },
      // Algunos pisos con subagentes trabajando (de 1 a 4) para ver los ayudantes.
      ...(agent === "claude" ? { subagentsActive: i % 5, subagentsTotal: (i % 5) + 2, contextPercent: [35, 72, 91][i % 3] } : {}),
      // Una avería de muestra (límite de uso) en el tercer piso.
      ...(i === 2 ? { failure: { kind: "rate_limit" as const, at: new Date().toISOString() } } : {}),
    };
  });
  usageLimits = demoUsage(new Date());
  status = "demo";
} else {
  connectState(collectorWs, (next) => { liveSessions = next; if (replay) return; sessions = next; scheduleRender(); }, (next) => { status = next; render(); }, (next) => { usageLimits = next; refreshUsage(); });
}
// Rebobinar: pide el día al colector y recorre sus fotogramas con el deslizador o reproduciéndolos.
const replayBar = document.querySelector<HTMLElement>("#replay-bar")!;
const replayBtn = document.querySelector<HTMLButtonElement>("#city-replay")!;
const replayDay = document.querySelector<HTMLSelectElement>("#replay-day")!;
const replayRange = document.querySelector<HTMLInputElement>("#replay-range")!;
const replayTime = document.querySelector<HTMLOutputElement>("#replay-time")!;
const replayPlay = document.querySelector<HTMLButtonElement>("#replay-play")!;
function showFrame(index: number): void {
  if (!replay) return;
  replay.index = Math.max(0, Math.min(index, replay.h.frames.length - 1));
  sessions = frameSessions(replay.h, replay.index);
  replayRange.value = String(replay.index);
  replayTime.value = frameTime(replay.h.frames[replay.index]?.at ?? replay.h.from);
  render();
}
function stopPlaying(): void {
  if (replay?.timer) { clearInterval(replay.timer); replay.timer = undefined; }
  replayPlay.textContent = "▶ Reproducir";
}
async function loadReplay(day: string): Promise<void> {
  stopPlaying();
  if (demo !== null) { ui.announce("Rebobinar necesita el colector: no está disponible en la demostración"); return exitReplay(); }
  ui.announce(`Cargando ${day}…`);
  try {
    const res = await fetch(`${collectorHttp}/history?day=${encodeURIComponent(day)}`);
    if (!res.ok) throw new Error(String(res.status));
    const h = (await res.json()) as HistoryResponse;
    if (!replayBar.hidden) {
      replay = { h, index: 0 };
      replayRange.max = String(Math.max(0, h.frames.length - 1));
      showFrame(firstBusyFrame(h));
      ui.announce(h.frames.some((f) => f.sessions.length) ? `Rebobinando ${day}: mueve el deslizador o pulsa Reproducir` : `No hay actividad guardada de ${day}`);
    }
  } catch {
    ui.announce("No se pudo cargar ese día: ¿está el colector encendido?");
  }
}
function enterReplay(): void {
  replayDay.replaceChildren(...replayDays(new Date()).map((d, i) => new Option(i === 0 ? `Hoy (${d})` : i === 1 ? `Ayer (${d})` : d, d)));
  replayBar.hidden = false;
  replayBtn.setAttribute("aria-pressed", "true");
  void loadReplay(replayDay.value);
}
function exitReplay(): void {
  stopPlaying();
  replay = null;
  replayBar.hidden = true;
  replayBtn.setAttribute("aria-pressed", "false");
  sessions = demo !== null ? sessions : liveSessions;
  render();
  ui.announce("De vuelta al directo");
}
replayBtn.addEventListener("click", () => (replayBar.hidden ? enterReplay() : exitReplay()));
document.querySelector("#replay-exit")!.addEventListener("click", exitReplay);
replayDay.addEventListener("change", () => void loadReplay(replayDay.value));
replayRange.addEventListener("input", () => { stopPlaying(); showFrame(Number(replayRange.value)); });
replayPlay.addEventListener("click", () => {
  if (!replay) return;
  if (replay.timer) return stopPlaying();
  if (replay.index >= replay.h.frames.length - 1) showFrame(0);
  replayPlay.textContent = "⏸ Pausa";
  // Un día entero (288 fotogramas de 5 min) en unos 30 s.
  replay.timer = setInterval(() => {
    if (!replay || replay.index >= replay.h.frames.length - 1) return stopPlaying();
    showFrame(replay.index + 1);
  }, 100);
});

render();
ui.announce(navigationHint());
if (document.hidden) app.ticker.stop();
