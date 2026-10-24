// Decorado de la vista frontal: skyline lejano, nubes, árboles, farolas, peatones y coches.
// Es determinista (mismo ancho y edificios → mismo decorado) para que no salte al redibujar.

export type Span = { x: number; w: number };
export type BackBuilding = { x: number; w: number; h: number; color: string; windows: Array<[number, number]> };
export type Scenery = {
  skyline: BackBuilding[];
  clouds: Array<{ x: number; y: number; w: number; speed: number }>;
  trees: number[];
  lamps: number[];
  benches: number[];
  walkers: Array<{ x: number; speed: number; shirt: string }>;
  cars: Array<{ x: number; speed: number; color: string }>;
};

const SKYLINE = ["#B9CFE3", "#AEC4DA", "#C3D6E8"];
const SHIRTS = ["#E07A5F", "#3D8BD9", "#F2CC8F", "#81B29A", "#B07BD9"];
const CARS = ["#E5484D", "#F5C542", "#3D8BD9", "#E6E8EF"];

/** Generador pseudoaleatorio simple con semilla fija. */
function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32);
}

/** Libre de edificios reales (con margen para la fachada lateral). */
function free(x: number, w: number, blocked: Span[]): boolean {
  return blocked.every((b) => x + w < b.x - 8 || x > b.x + b.w + 36);
}

export function layoutScenery(worldWidth: number, groundY: number, buildings: Span[]): Scenery {
  const r = rng(7);
  const skyline: BackBuilding[] = [];
  for (let x = -20; x < worldWidth; ) {
    const w = 50 + Math.round(r() * 70), h = 80 + Math.round(r() * 180);
    const windows: Array<[number, number]> = [];
    for (let wy = 14; wy < h - 10; wy += 18) for (let wx = 10; wx < w - 10; wx += 16) if (r() < 0.35) windows.push([wx, wy]);
    skyline.push({ x, w, h, color: SKYLINE[Math.floor(r() * SKYLINE.length)], windows });
    x += w + Math.round(r() * 12);
  }
  const clouds = Array.from({ length: Math.max(3, Math.round(worldWidth / 260)) }, () => ({
    x: Math.round(r() * worldWidth), y: Math.round(groundY - 330 - r() * 260), w: 50 + Math.round(r() * 60), speed: 4 + r() * 6,
  }));
  const trees: number[] = [], lamps: number[] = [], benches: number[] = [];
  for (let x = 20; x < worldWidth - 30; x += 70) {
    const kind = Math.floor(r() * 4);
    if (kind === 3) continue;
    const w = kind === 2 ? 34 : 28;
    if (!free(x, w, buildings)) continue;
    (kind === 0 ? trees : kind === 1 ? lamps : benches).push(x);
  }
  const walkers = Array.from({ length: Math.max(3, Math.round(worldWidth / 220)) }, (_, i) => ({
    x: Math.round(r() * worldWidth), speed: (12 + r() * 14) * (i % 2 ? -1 : 1), shirt: SHIRTS[i % SHIRTS.length],
  }));
  const cars = Array.from({ length: 2 }, (_, i) => ({ x: Math.round(r() * worldWidth), speed: (50 + r() * 30) * (i % 2 ? -1 : 1), color: CARS[i % CARS.length] }));
  return { skyline, clouds, trees, lamps, benches, walkers, cars };
}

/** Posición x en un recorrido que da la vuelta al mundo (con margen para salir y entrar por los bordes). */
export function wrapX(x0: number, speed: number, ms: number, worldWidth: number, margin = 40): number {
  const span = worldWidth + 2 * margin;
  return ((((x0 + margin + (speed * ms) / 1000) % span) + span) % span) - margin;
}
