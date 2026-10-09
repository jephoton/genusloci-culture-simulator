import { createRng } from "@/sim/rng";
import { toLocalMetres } from "@/world/projection";
import type { VenueKind, World } from "@/world/schema";

/** 1 scene unit = 10 m. Scene x = east, scene z = south (local y north → -z). */
export const METRES_PER_UNIT = 10;
export const PADS_PER_CELL = 6;
/** Landmarks are drawn larger than life so they read as places at city zoom. */
export const LANDMARK_SCALE = 2.2;
/**
 * Unscaled horizontal footprint radius of each landmark kind (circumscribed circle of the geometry
 * in Landmarks.tsx). The stadium is drawn shrunk so it fits a pad like the others.
 */
export const LANDMARK_RADIUS: Record<VenueKind, number> = {
  club: 2.34,
  bar: 2.33,
  cafe: 1.7,
  restaurant: 2.4,
  gallery: 2.2,
  music_venue: 3.21,
  shop: 1.28,
  stadium: 3.2,
  other: 1.56,
};
/**
 * Clearance (scene units) from a landmark pad's centre to roads, water and parks, and from a pad to a
 * building's footprint: room for the largest landmark, since any kind can open on any pad.
 */
export const PAD_CLEARANCE = LANDMARK_SCALE * Math.max(...Object.values(LANDMARK_RADIUS)) + 0.5;
export const ROAD_HALF_WIDTH = { major: 1.2, minor: 0.6 } as const;
/** Spacing (scene units) of the candidate grid searched for landmark pads. */
const PAD_STEP = 2;
const PAD_HASH_CELL = 32;
const MAX_BUILDINGS = 16000;
const CANDIDATES = 60000;
const HASH_CELL = 8;

export type XZ = [number, number];

export type CityLayout = {
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
  center: { x: number; z: number };
  /** Median distance between neighbouring cell centres (scene units). */
  spacing: number;
  cellX: Float32Array;
  cellZ: Float32Array;
  /** nCells × PADS_PER_CELL × (x, z) landmark pads. */
  pads: Float32Array;
  /** How many pads could not meet the clearance rules and took the best remaining spot instead. */
  fallbackPads: number;
  buildings: {
    count: number;
    x: Float32Array;
    z: Float32Array;
    w: Float32Array;
    d: Float32Array;
    h: Float32Array;
    seed: Float32Array;
  };
  roads: { kind: "major" | "minor"; points: XZ[] }[];
  water: XZ[][];
  parks: XZ[][];
};

/** Deterministic integer hash → [0, 1). */
export function hash01(n: number): number {
  let h = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

const toScene = (x: number, y: number): XZ => [x / METRES_PER_UNIT, -y / METRES_PER_UNIT];

export function distToSegment(px: number, pz: number, a: XZ, b: XZ): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / len2));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

/** Even-odd ray casting. */
export function pointInPolygon(x: number, z: number, poly: XZ[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

/** Uniform-grid spatial hash over axis-aligned boxes. */
class SpatialHash<T> {
  private readonly cells = new Map<string, T[]>();
  constructor(private readonly size = HASH_CELL) {}
  add(x0: number, z0: number, x1: number, z1: number, item: T): void {
    const size = this.size;
    for (let i = Math.floor(x0 / size); i <= Math.floor(x1 / size); i++) {
      for (let j = Math.floor(z0 / size); j <= Math.floor(z1 / size); j++) {
        const key = `${i},${j}`;
        const list = this.cells.get(key);
        if (list) list.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }
  near(x: number, z: number, r: number): T[] {
    const out = new Set<T>();
    const size = this.size;
    for (let i = Math.floor((x - r) / size); i <= Math.floor((x + r) / size); i++) {
      for (let j = Math.floor((z - r) / size); j <= Math.floor((z + r) / size); j++) {
        for (const item of this.cells.get(`${i},${j}`) ?? []) out.add(item);
      }
    }
    return [...out];
  }
  /** Allocation-free variant of near(): an item spanning several hash cells may be visited more than once. */
  forEachNear(x: number, z: number, r: number, fn: (item: T) => void): void {
    const size = this.size;
    for (let i = Math.floor((x - r) / size); i <= Math.floor((x + r) / size); i++) {
      for (let j = Math.floor((z - r) / size); j <= Math.floor((z + r) / size); j++) {
        const list = this.cells.get(`${i},${j}`);
        if (list) for (let k = 0; k < list.length; k++) fn(list[k]);
      }
    }
  }
}

export function nearestCell(layout: Pick<CityLayout, "cellX" | "cellZ">, x: number, z: number): number {
  let best = 0;
  let bestD = Infinity;
  for (let c = 0; c < layout.cellX.length; c++) {
    const d = (layout.cellX[c] - x) ** 2 + (layout.cellZ[c] - z) ** 2;
    if (d < bestD) {
      bestD = d;
      best = c;
    }
  }
  return best;
}

export function landmarkPosition(layout: CityLayout, cell: number, pad: number): XZ {
  const i = (cell * PADS_PER_CELL + (pad % PADS_PER_CELL)) * 2;
  return [layout.pads[i], layout.pads[i + 1]];
}

/** Deterministic home position for an agent: scattered within 0.4 × spacing of its cell centre. */
export function agentHomePosition(layout: CityLayout, cell: number, agent: number): XZ {
  const a = hash01(agent * 2 + 1) * Math.PI * 2;
  const r = Math.sqrt(hash01(agent * 2 + 2)) * layout.spacing * 0.4;
  return [layout.cellX[cell] + r * Math.cos(a), layout.cellZ[cell] + r * Math.sin(a)];
}

type RoadSegment = { a: XZ; b: XZ; half: number };

function addSegment(hash: SpatialHash<RoadSegment>, s: RoadSegment): void {
  const { a, b, half } = s;
  hash.add(Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half, Math.max(a[0], b[0]) + half, Math.max(a[1], b[1]) + half, s);
}

/** Distance from a point to a polygon's boundary, negative when the point is inside. */
function signedDistToPolygon(x: number, z: number, poly: XZ[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(x, z, poly[j], poly[i]));
  return pointInPolygon(x, z, poly) ? -d : d;
}

/**
 * Chooses PADS_PER_CELL landmark pads per cell from a grid of candidates within `spacing` of the cell
 * centre, nearest first. A pad must clear every road by its half-width + PAD_CLEARANCE, stay
 * PAD_CLEARANCE outside water and parks, and sit at least 2 × PAD_CLEARANCE from every other pad.
 * A cell short of valid spots falls back to the candidates that break those rules the least.
 */
function placePads({
  cellX, cellZ, spacing, segments, areas,
}: {
  cellX: Float32Array;
  cellZ: Float32Array;
  spacing: number;
  segments: RoadSegment[];
  areas: XZ[][];
}): { pads: Float32Array; fallbackPads: number } {
  const nC = cellX.length;
  // Coarser than the building hash: each pad query reaches ~9 units, so this keeps it to a few cells.
  const roadHash = new SpatialHash<RoadSegment>(PAD_HASH_CELL);
  for (const s of segments) addSegment(roadHash, s);
  const boxes = areas.map((poly) => ({
    poly,
    minX: Math.min(...poly.map((p) => p[0])) - PAD_CLEARANCE,
    maxX: Math.max(...poly.map((p) => p[0])) + PAD_CLEARANCE,
    minZ: Math.min(...poly.map((p) => p[1])) - PAD_CLEARANCE,
    maxZ: Math.max(...poly.map((p) => p[1])) + PAD_CLEARANCE,
  }));
  const pads = new Float32Array(nC * PADS_PER_CELL * 2);
  const placed = new SpatialHash<XZ>();
  const minGap = 2 * PAD_CLEARANCE;
  let fallbackPads = 0;

  const n = Math.floor(spacing / PAD_STEP);
  const offsets: { dx: number; dz: number; r: number }[] = [];
  for (let j = -n; j <= n; j++) {
    for (let i = -n; i <= n; i++) {
      const r = Math.hypot(i, j) * PAD_STEP;
      if (r <= spacing) offsets.push({ dx: i * PAD_STEP, dz: j * PAD_STEP, r });
    }
  }
  offsets.sort((a, b) => a.r - b.r); // stable: ties keep row-major order

  /** How far (scene units) a spot is from breaking the road and area rules; negative when it breaks one. */
  const siteSlack = (x: number, z: number): number => {
    let slack = Infinity;
    roadHash.forEachNear(x, z, PAD_CLEARANCE + ROAD_HALF_WIDTH.major, (s) => {
      slack = Math.min(slack, distToSegment(x, z, s.a, s.b) - s.half - PAD_CLEARANCE);
    });
    if (slack < 0) return slack;
    for (const b of boxes) {
      if (x >= b.minX && x <= b.maxX && z >= b.minZ && z <= b.maxZ) slack = Math.min(slack, signedDistToPolygon(x, z, b.poly) - PAD_CLEARANCE);
    }
    return slack;
  };
  const gapSlack = (x: number, z: number): number => {
    let slack = Infinity;
    placed.forEachNear(x, z, minGap, ([px, pz]) => {
      slack = Math.min(slack, Math.hypot(px - x, pz - z) - minGap);
    });
    return slack;
  };

  for (let c = 0; c < nC; c++) {
    const chosen: XZ[] = [];
    const take = (p: XZ) => {
      const k = c * PADS_PER_CELL + chosen.length;
      pads[k * 2] = p[0];
      pads[k * 2 + 1] = p[1];
      placed.add(p[0], p[1], p[0], p[1], p);
      chosen.push(p);
    };
    const candidates: { p: XZ; site: number }[] = [];
    for (const o of offsets) {
      if (chosen.length === PADS_PER_CELL) break;
      const p: XZ = [Math.fround(cellX[c] + o.dx), Math.fround(cellZ[c] + o.dz)];
      const site = siteSlack(p[0], p[1]);
      candidates.push({ p, site });
      // Cheapest test first: most candidates fail the road check, and the nearest-cell scan is O(cells).
      if (site >= 0 && gapSlack(p[0], p[1]) >= 0 && nearestCell({ cellX, cellZ }, p[0], p[1]) === c) take(p);
    }
    const own = chosen.length < PADS_PER_CELL ? candidates.filter(({ p }) => nearestCell({ cellX, cellZ }, p[0], p[1]) === c) : [];
    while (chosen.length < PADS_PER_CELL) {
      let best: XZ = [cellX[c], cellZ[c]];
      let bestScore = -Infinity;
      for (const { p, site } of own) {
        const score = Math.min(site, gapSlack(p[0], p[1]));
        if (score > bestScore) {
          bestScore = score;
          best = p;
        }
      }
      take(best);
      fallbackPads++;
    }
  }
  return { pads, fallbackPads };
}

/**
 * Deterministic city layout in scene units. Buildings are rejection-sampled across the city:
 * acceptance rises with the density of the nearest cell, and candidates that touch roads, water,
 * parks, landmark pads or other buildings are rejected. Heights grow with density.
 */
export function buildLayout(world: World, seed = 1): CityLayout {
  const nC = world.cells.length;
  const cellX = new Float32Array(nC);
  const cellZ = new Float32Array(nC);
  world.cells.forEach((c, i) => {
    const p = toLocalMetres(c, world.city);
    [cellX[i], cellZ[i]] = toScene(p.x, p.y);
  });

  const nn: number[] = [];
  for (let i = 0; i < nC; i++) {
    let best = Infinity;
    for (let j = 0; j < nC; j++) if (j !== i) best = Math.min(best, Math.hypot(cellX[i] - cellX[j], cellZ[i] - cellZ[j]));
    if (Number.isFinite(best)) nn.push(best);
  }
  nn.sort((a, b) => a - b);
  const spacing = nn.length > 0 ? nn[Math.floor(nn.length / 2)] : 60;

  const geo = world.geo;
  const bounds = geo
    ? {
        minX: geo.bounds.minX / METRES_PER_UNIT,
        maxX: geo.bounds.maxX / METRES_PER_UNIT,
        minZ: -geo.bounds.maxY / METRES_PER_UNIT,
        maxZ: -geo.bounds.minY / METRES_PER_UNIT,
      }
    : {
        minX: Math.min(...cellX) - spacing / 2,
        maxX: Math.max(...cellX) + spacing / 2,
        minZ: Math.min(...cellZ) - spacing / 2,
        maxZ: Math.max(...cellZ) + spacing / 2,
      };
  const roads = (geo?.roads ?? []).map((r) => ({ kind: r.kind, points: r.points.map(([x, y]) => toScene(x, y)) }));
  const water = (geo?.water ?? []).map((ring) => ring.map(([x, y]) => toScene(x, y)));
  const parks = (geo?.parks ?? []).map((ring) => ring.map(([x, y]) => toScene(x, y)));

  const segments = roads.flatMap((r) => r.points.slice(1).map((b, i): RoadSegment => ({ a: r.points[i], b, half: ROAD_HALF_WIDTH[r.kind] })));
  const roadHash = new SpatialHash<RoadSegment>();
  for (const s of segments) addSegment(roadHash, s);

  const { pads, fallbackPads } = placePads({ cellX, cellZ, spacing, segments, areas: [...water, ...parks] });
  const padHash = new SpatialHash<XZ>();
  for (let i = 0; i < pads.length; i += 2) padHash.add(pads[i], pads[i + 1], pads[i], pads[i + 1], [pads[i], pads[i + 1]]);

  const densities = world.cells.map((c) => c.density);
  const dMin = Math.min(...densities);
  const dMax = Math.max(...densities);
  const norm = (c: number) => (dMax > dMin ? (densities[c] - dMin) / (dMax - dMin) : 1);

  const bx = new Float32Array(MAX_BUILDINGS);
  const bz = new Float32Array(MAX_BUILDINGS);
  const bw = new Float32Array(MAX_BUILDINGS);
  const bd = new Float32Array(MAX_BUILDINGS);
  const bh = new Float32Array(MAX_BUILDINGS);
  const bs = new Float32Array(MAX_BUILDINGS);
  const br = new Float32Array(MAX_BUILDINGS);
  const buildingHash = new SpatialHash<number>();
  const rng = createRng(seed);
  let count = 0;

  for (let t = 0; t < CANDIDATES && count < MAX_BUILDINGS; t++) {
    const x = bounds.minX + rng.next() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rng.next() * (bounds.maxZ - bounds.minZ);
    const w = 3 + rng.next() * 4;
    const d = 3 + rng.next() * 4;
    const heightRoll = rng.next();
    const acceptRoll = rng.next();

    const cell = nearestCell({ cellX, cellZ }, x, z);
    if (Math.hypot(cellX[cell] - x, cellZ[cell] - z) > spacing) continue;
    const dn = norm(cell);
    if (acceptRoll > 0.35 + 0.65 * dn) continue;

    const radius = Math.hypot(w, d) / 2;
    const maxHalf = ROAD_HALF_WIDTH.major;
    if (roadHash.near(x, z, radius + maxHalf).some((s) => distToSegment(x, z, s.a, s.b) < s.half + radius)) continue;
    if (padHash.near(x, z, radius + PAD_CLEARANCE).some(([px, pz]) => Math.hypot(px - x, pz - z) < radius + PAD_CLEARANCE)) continue;
    if (water.some((p) => pointInPolygon(x, z, p)) || parks.some((p) => pointInPolygon(x, z, p))) continue;
    if (buildingHash.near(x, z, radius + 4).some((j) => Math.hypot(bx[j] - x, bz[j] - z) < radius + br[j] + 0.4)) continue;

    bx[count] = x;
    bz[count] = z;
    bw[count] = w;
    bd[count] = d;
    bh[count] = 1.5 + heightRoll * heightRoll * (3 + 16 * dn * dn);
    bs[count] = hash01(t + seed * 7919);
    br[count] = radius;
    buildingHash.add(x - radius, z - radius, x + radius, z + radius, count);
    count++;
  }

  return {
    bounds,
    center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    spacing,
    cellX,
    cellZ,
    pads,
    fallbackPads,
    buildings: {
      count,
      x: bx.slice(0, count),
      z: bz.slice(0, count),
      w: bw.slice(0, count),
      d: bd.slice(0, count),
      h: bh.slice(0, count),
      seed: bs.slice(0, count),
    },
    roads,
    water,
    parks,
  };
}
