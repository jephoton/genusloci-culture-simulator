import { pointInPolygon as pointInRing } from "@/geo/geometry";
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
const MAX_BUILDINGS = 16000;
const CANDIDATES = 60000;
/** Largest building footprint radius: half the diagonal of a 7 × 7 footprint. */
const MAX_BUILDING_RADIUS = Math.hypot(7, 7) / 2;
const BUILDING_GAP = 0.4;
/** Grid cell sizes (scene units), matched to the radii their queries reach. */
const ROAD_GRID_CELL = 4;
const AREA_GRID_CELL = 8;
const BUILDING_GRID_CELL = 8;

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

function segDist(px: number, pz: number, ax: number, az: number, bx: number, bz: number): number {
  const dx = bx - ax;
  const dz = bz - az;
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / len2));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function distToSegment(px: number, pz: number, a: XZ, b: XZ): number {
  return segDist(px, pz, a[0], a[1], b[0], b[1]);
}

/** Even-odd point-in-polygon on scene x/z (re-exported from the shared geometry module). */
export function pointInPolygon(x: number, z: number, poly: XZ[]): boolean {
  return pointInRing(x, z, poly);
}

/**
 * Uniform grid over a fixed extent; each grid cell lists the ids of the boxes that overlap it. Points
 * outside the extent clamp to the border cells, so queries stay exact anywhere. Ids must be small
 * non-negative integers; each query visits an id once even when its box spans several grid cells.
 */
class Grid {
  private readonly cells: (number[] | undefined)[];
  private readonly nx: number;
  private readonly nz: number;
  private seen = new Int32Array(64);
  private stamp = 0;
  constructor(
    private readonly minX: number,
    private readonly minZ: number,
    maxX: number,
    maxZ: number,
    private readonly size: number,
  ) {
    this.nx = Math.max(1, Math.ceil((maxX - minX) / size));
    this.nz = Math.max(1, Math.ceil((maxZ - minZ) / size));
    this.cells = new Array(this.nx * this.nz);
  }
  private ix(x: number): number {
    const i = Math.floor((x - this.minX) / this.size);
    return i < 0 ? 0 : i >= this.nx ? this.nx - 1 : i;
  }
  private iz(z: number): number {
    const j = Math.floor((z - this.minZ) / this.size);
    return j < 0 ? 0 : j >= this.nz ? this.nz - 1 : j;
  }
  add(x0: number, z0: number, x1: number, z1: number, id: number): void {
    if (id >= this.seen.length) {
      const grown = new Int32Array(Math.max(id + 1, this.seen.length * 2));
      grown.set(this.seen);
      this.seen = grown;
    }
    const i1 = this.ix(x1);
    const j1 = this.iz(z1);
    for (let j = this.iz(z0); j <= j1; j++) {
      for (let i = this.ix(x0); i <= i1; i++) {
        const k = j * this.nx + i;
        const list = this.cells[k];
        if (list) list.push(id);
        else this.cells[k] = [id];
      }
    }
  }
  /** Visits the id of every box that may overlap the square of half-size r around (x, z). */
  forEachNear(x: number, z: number, r: number, fn: (id: number) => void): void {
    const seen = this.seen;
    const stamp = ++this.stamp;
    const i0 = this.ix(x - r);
    const i1 = this.ix(x + r);
    const j1 = this.iz(z + r);
    for (let j = this.iz(z - r); j <= j1; j++) {
      for (let i = i0; i <= i1; i++) {
        const list = this.cells[j * this.nx + i];
        if (!list) continue;
        for (let k = 0; k < list.length; k++) {
          const id = list[k];
          if (seen[id] === stamp) continue;
          seen[id] = stamp;
          fn(id);
        }
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

/** Roads, water and parks indexed in uniform grids for clearance queries. */
type Obstacles = {
  /** 5 per road segment: ax, az, bx, bz, half-width. */
  segs: Float64Array;
  roadGrid: Grid;
  polys: XZ[][];
  /** 4 per polygon: minX, minZ, maxX, maxZ. */
  polyBox: Float64Array;
  boxGrid: Grid;
  /** 4 per polygon edge: ax, az, bx, bz. */
  edges: Float64Array;
  edgeGrid: Grid;
};

function indexObstacles(bounds: CityLayout["bounds"], roads: CityLayout["roads"], areas: XZ[][]): Obstacles {
  const { minX, minZ, maxX, maxZ } = bounds;
  const segs = new Float64Array(roads.reduce((a, r) => a + r.points.length - 1, 0) * 5);
  const roadGrid = new Grid(minX, minZ, maxX, maxZ, ROAD_GRID_CELL);
  let s = 0;
  for (const r of roads) {
    const half = ROAD_HALF_WIDTH[r.kind];
    for (let i = 1; i < r.points.length; i++, s++) {
      const [ax, az] = r.points[i - 1];
      const [bx, bz] = r.points[i];
      segs.set([ax, az, bx, bz, half], s * 5);
      roadGrid.add(Math.min(ax, bx) - half, Math.min(az, bz) - half, Math.max(ax, bx) + half, Math.max(az, bz) + half, s);
    }
  }
  const polyBox = new Float64Array(areas.length * 4);
  const boxGrid = new Grid(minX, minZ, maxX, maxZ, AREA_GRID_CELL);
  const edges = new Float64Array(areas.reduce((a, p) => a + p.length, 0) * 4);
  const edgeGrid = new Grid(minX, minZ, maxX, maxZ, AREA_GRID_CELL);
  let e = 0;
  areas.forEach((poly, p) => {
    let x0 = Infinity;
    let z0 = Infinity;
    let x1 = -Infinity;
    let z1 = -Infinity;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++, e++) {
      const [ax, az] = poly[j];
      const [bx, bz] = poly[i];
      edges.set([ax, az, bx, bz], e * 4);
      edgeGrid.add(Math.min(ax, bx), Math.min(az, bz), Math.max(ax, bx), Math.max(az, bz), e);
      x0 = Math.min(x0, bx);
      z0 = Math.min(z0, bz);
      x1 = Math.max(x1, bx);
      z1 = Math.max(z1, bz);
    }
    polyBox.set([x0, z0, x1, z1], p * 4);
    boxGrid.add(x0, z0, x1, z1, p);
  });
  return { segs, roadGrid, polys: areas, polyBox, boxGrid, edges, edgeGrid };
}

/** Distance from (x, z) to the nearest road edge (centreline distance minus half-width), capped at `cap`. */
function roadRoom(o: Obstacles, x: number, z: number, cap: number): number {
  let c = cap;
  const segs = o.segs;
  o.roadGrid.forEachNear(x, z, cap + ROAD_HALF_WIDTH.major, (s) => {
    const k = s * 5;
    const d = segDist(x, z, segs[k], segs[k + 1], segs[k + 2], segs[k + 3]) - segs[k + 4];
    if (d < c) c = d;
  });
  return c;
}

function insideArea(o: Obstacles, x: number, z: number): boolean {
  let inside = false;
  const b = o.polyBox;
  o.boxGrid.forEachNear(x, z, 0, (p) => {
    const k = p * 4;
    if (!inside && x >= b[k] && x <= b[k + 2] && z >= b[k + 1] && z <= b[k + 3] && pointInPolygon(x, z, o.polys[p])) inside = true;
  });
  return inside;
}

/** Signed distance from (x, z) to the nearest water or park boundary, capped at ±`cap`: negative inside. */
function areaRoom(o: Obstacles, x: number, z: number, cap: number): number {
  let c = cap;
  const edges = o.edges;
  o.edgeGrid.forEachNear(x, z, cap, (e) => {
    const k = e * 4;
    const d = segDist(x, z, edges[k], edges[k + 1], edges[k + 2], edges[k + 3]);
    if (d < c) c = d;
  });
  return insideArea(o, x, z) ? -c : c;
}

/** Exact nearest cell via a grid of cell centres; falls back to a full scan far from every cell. */
function cellFinder(cellX: Float32Array, cellZ: Float32Array, spacing: number, bounds: CityLayout["bounds"]): (x: number, z: number) => number {
  const grid = new Grid(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, spacing);
  for (let c = 0; c < cellX.length; c++) grid.add(cellX[c], cellZ[c], cellX[c], cellZ[c], c);
  const reach = spacing * 1.5;
  return (x, z) => {
    let best = -1;
    let bestD = Infinity;
    grid.forEachNear(x, z, reach, (c) => {
      const d = (cellX[c] - x) ** 2 + (cellZ[c] - z) ** 2;
      if (d < bestD || (d === bestD && c < best)) {
        bestD = d;
        best = c;
      }
    });
    // Every cell within `reach` was visited, so a winner that close is the true nearest.
    return best >= 0 && bestD <= reach * reach ? best : nearestCell({ cellX, cellZ }, x, z);
  };
}

/**
 * Chooses PADS_PER_CELL landmark pads per cell from a grid of candidates within `spacing` of the cell
 * centre, nearest first. A pad must clear every road by its half-width + PAD_CLEARANCE, stay
 * PAD_CLEARANCE outside water and parks, and sit at least 2 × PAD_CLEARANCE from every other pad.
 * A cell short of valid spots falls back to the candidates that break those rules the least.
 */
function placePads({
  cellX, cellZ, spacing, bounds, obstacles, nearest,
}: {
  cellX: Float32Array;
  cellZ: Float32Array;
  spacing: number;
  bounds: CityLayout["bounds"];
  obstacles: Obstacles;
  nearest: (x: number, z: number) => number;
}): { pads: Float32Array; fallbackPads: number } {
  const nC = cellX.length;
  const pads = new Float32Array(nC * PADS_PER_CELL * 2);
  const minGap = 2 * PAD_CLEARANCE;
  const placed = new Grid(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, minGap);
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
    const road = roadRoom(obstacles, x, z, 2 * PAD_CLEARANCE) - PAD_CLEARANCE;
    if (road < 0) return road;
    return Math.min(road, areaRoom(obstacles, x, z, 2 * PAD_CLEARANCE) - PAD_CLEARANCE);
  };
  const gapSlack = (x: number, z: number): number => {
    let slack = Infinity;
    placed.forEachNear(x, z, minGap, (k) => {
      slack = Math.min(slack, Math.hypot(pads[k * 2] - x, pads[k * 2 + 1] - z) - minGap);
    });
    return slack;
  };

  for (let c = 0; c < nC; c++) {
    let chosen = 0;
    const take = (x: number, z: number) => {
      const k = c * PADS_PER_CELL + chosen;
      pads[k * 2] = x;
      pads[k * 2 + 1] = z;
      placed.add(x, z, x, z, k);
      chosen++;
    };
    const own: { x: number; z: number; site: number }[] = [];
    for (const o of offsets) {
      if (chosen === PADS_PER_CELL) break;
      const x = Math.fround(cellX[c] + o.dx);
      const z = Math.fround(cellZ[c] + o.dz);
      if (nearest(x, z) !== c) continue;
      const site = siteSlack(x, z);
      own.push({ x, z, site });
      if (site >= 0 && gapSlack(x, z) >= 0) take(x, z);
    }
    while (chosen < PADS_PER_CELL) {
      let best: XZ = [cellX[c], cellZ[c]];
      let bestScore = -Infinity;
      for (const { x, z, site } of own) {
        if (site <= bestScore) continue;
        const score = Math.min(site, gapSlack(x, z));
        if (score > bestScore) {
          bestScore = score;
          best = [x, z];
        }
      }
      take(best[0], best[1]);
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

  const obstacles = indexObstacles(bounds, roads, [...water, ...parks]);
  const nearest = cellFinder(cellX, cellZ, spacing, bounds);
  const { pads, fallbackPads } = placePads({ cellX, cellZ, spacing, bounds, obstacles, nearest });
  const padGrid = new Grid(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, PAD_CLEARANCE);
  for (let i = 0; i < pads.length / 2; i++) padGrid.add(pads[i * 2], pads[i * 2 + 1], pads[i * 2], pads[i * 2 + 1], i);

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
  const buildingGrid = new Grid(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, BUILDING_GRID_CELL);
  const rng = createRng(seed);
  let count = 0;

  for (let t = 0; t < CANDIDATES && count < MAX_BUILDINGS; t++) {
    const x = bounds.minX + rng.next() * (bounds.maxX - bounds.minX);
    const z = bounds.minZ + rng.next() * (bounds.maxZ - bounds.minZ);
    const w = 3 + rng.next() * 4;
    const d = 3 + rng.next() * 4;
    const heightRoll = rng.next();
    const acceptRoll = rng.next();

    const cell = nearest(x, z);
    if (Math.hypot(cellX[cell] - x, cellZ[cell] - z) > spacing) continue;
    const dn = norm(cell);
    if (acceptRoll > 0.35 + 0.65 * dn) continue;

    const radius = Math.hypot(w, d) / 2;
    if (roadRoom(obstacles, x, z, radius) < radius) continue;
    let blocked = false;
    padGrid.forEachNear(x, z, radius + PAD_CLEARANCE, (p) => {
      if (Math.hypot(pads[p * 2] - x, pads[p * 2 + 1] - z) < radius + PAD_CLEARANCE) blocked = true;
    });
    if (blocked || insideArea(obstacles, x, z)) continue;
    buildingGrid.forEachNear(x, z, radius + MAX_BUILDING_RADIUS + BUILDING_GAP, (j) => {
      if (Math.hypot(bx[j] - x, bz[j] - z) < radius + br[j] + BUILDING_GAP) blocked = true;
    });
    if (blocked) continue;

    bx[count] = x;
    bz[count] = z;
    bw[count] = w;
    bd[count] = d;
    bh[count] = 1.5 + heightRoll * heightRoll * (3 + 16 * dn * dn);
    bs[count] = hash01(t + seed * 7919);
    br[count] = radius;
    buildingGrid.add(x - radius, z - radius, x + radius, z + radius, count);
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
