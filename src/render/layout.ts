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
/** Any kind can open on any pad, so each pad is sized for the largest landmark. */
export const MAX_LANDMARK_RADIUS = Math.max(...Object.values(LANDMARK_RADIUS));
/** Smallest scale a pad may shrink its landmarks to where the streets are tight. */
export const MIN_LANDMARK_SCALE = 1;
/** Room (scene units) kept between a pad's largest landmark and buildings. */
export const PAD_MARGIN = 0.25;
/** Room (scene units) kept between the largest landmarks of two pads. */
export const PAD_GAP = 0.5;
const FULL_PAD_RADIUS = LANDMARK_SCALE * MAX_LANDMARK_RADIUS;
const MIN_PAD_RADIUS = MIN_LANDMARK_SCALE * MAX_LANDMARK_RADIUS;
export const ROAD_HALF_WIDTH = { major: 1.2, minor: 0.6 } as const;
/**
 * A cell may place pads a little beyond its own region (where it is the nearest cell): up to where it
 * is this fraction of `spacing` farther than the nearest cell (up to about 0.3 × `spacing` past the
 * boundary). It lets cells crowded by streets borrow open ground from their neighbours.
 */
const PAD_BORROW = 0.6;
/** Spacing (scene units) of the coarse candidate grid searched for landmark pads. */
const PAD_STEP = 2;
/** The best coarse pad spot is refined by a pattern search down to steps this fine (scene units). */
const PAD_REFINE_STEP = 1 / 8;
/** How many of the most promising spots are refined before a pad is left cramped. */
const PAD_SEEDS = 8;
const NEIGHBOURS: XZ[] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
const MAX_BUILDINGS = 16000;
const CANDIDATES = 80000;
/** Footprints shrink to fit their spot, but no side gets thinner than this (scene units). */
export const MIN_BUILDING_SIDE = 1.2;
/** Largest building footprint radius: half the diagonal of a 7 × 7 footprint. */
const MAX_BUILDING_RADIUS = Math.hypot(7, 7) / 2;
const BUILDING_GAP = 0.4;
/** Grid cell sizes (scene units), matched to the radii their queries reach. */
const ROAD_GRID_CELL = 4;
/** Radii (scene units) of the cheaper road queries tried before the full one. */
const ROAD_STAGES = [2, 4];
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
  /**
   * Per pad (nCells × PADS_PER_CELL): the scale its landmarks are drawn at, between MIN_LANDMARK_SCALE
   * and LANDMARK_SCALE. It is the largest at which the largest landmark kind clears every road
   * (beyond its half-width), water and parks, and keeps PAD_GAP from other pads' landmarks.
   */
  padScale: Float32Array;
  /** Pads where even MIN_LANDMARK_SCALE does not fit; they take the roomiest spot and draw at that scale. */
  crampedPads: number;
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

/** The scale landmarks on this pad are drawn at (see CityLayout.padScale). */
export function landmarkScale(layout: CityLayout, cell: number, pad: number): number {
  return layout.padScale[cell * PADS_PER_CELL + (pad % PADS_PER_CELL)];
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
  /** Whether each MASK_CELL square's centre is inside water or a park, over the city bounds. */
  mask: Uint8Array;
  maskNX: number;
  maskNZ: number;
  minX: number;
  minZ: number;
};

const MASK_CELL = 1;
/** A point this far from every area edge is on the same side as its mask square's centre (≤ 0.71 away). */
const MASK_SAFE = 0.75;

/** Even-odd scanline fill of each polygon at mask-cell centres, using pointInPolygon's crossing rule. */
function rasterAreas(areas: XZ[][], minX: number, minZ: number, nx: number, nz: number): Uint8Array {
  const mask = new Uint8Array(nx * nz);
  for (const poly of areas) {
    const rows = new Map<number, number[]>();
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i];
      const [xj, zj] = poly[j];
      const lo = Math.min(zi, zj);
      const hi = Math.max(zi, zj);
      // Row centres zc with lo <= zc < hi, i.e. (zi > zc) !== (zj > zc).
      for (let r = Math.max(0, Math.ceil((lo - minZ) / MASK_CELL - 0.5)); r < nz; r++) {
        const zc = minZ + (r + 0.5) * MASK_CELL;
        if (zc >= hi) break;
        if (zc < lo) continue;
        const cross = ((xj - xi) * (zc - zi)) / (zj - zi) + xi;
        const list = rows.get(r);
        if (list) list.push(cross);
        else rows.set(r, [cross]);
      }
    }
    for (const [r, xs] of rows) {
      xs.sort((a, b) => a - b);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        // Centres xc with xs[k] <= xc < xs[k + 1] have an odd number of crossings to their right.
        const i1 = Math.min(nx, Math.ceil((xs[k + 1] - minX) / MASK_CELL - 0.5));
        for (let i = Math.max(0, Math.ceil((xs[k] - minX) / MASK_CELL - 0.5)); i < i1; i++) mask[r * nx + i] = 1;
      }
    }
  }
  return mask;
}

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
  const maskNX = Math.max(1, Math.ceil((maxX - minX) / MASK_CELL));
  const maskNZ = Math.max(1, Math.ceil((maxZ - minZ) / MASK_CELL));
  const mask = rasterAreas(areas, minX, minZ, maskNX, maskNZ);
  return { segs, roadGrid, polys: areas, polyBox, boxGrid, edges, edgeGrid, mask, maskNX, maskNZ, minX, minZ };
}

/**
 * Distance from (x, z) to the nearest road edge (centreline distance minus half-width), capped at `cap`.
 * Segment boxes are indexed grown by their half-width, so a segment outside the query square has more
 * room than the square's half-size.
 */
function roadRoom(o: Obstacles, x: number, z: number, cap: number): number {
  // Most spots are near a street: small queries settle them, and only roomy spots need the full one.
  for (const r of ROAD_STAGES) {
    if (r >= cap) break;
    const near = roadRoomWithin(o, x, z, r);
    if (near < r) return near;
  }
  return roadRoomWithin(o, x, z, cap);
}

function roadRoomWithin(o: Obstacles, x: number, z: number, cap: number): number {
  let c = cap;
  const segs = o.segs;
  o.roadGrid.forEachNear(x, z, cap, (s) => {
    const k = s * 5;
    const d = segDist(x, z, segs[k], segs[k + 1], segs[k + 2], segs[k + 3]) - segs[k + 4];
    if (d < c) c = d;
  });
  return c;
}

/** Whether (x, z) is in water or a park. `farFromEdges`: no area edge lies within MASK_SAFE of it. */
function insideArea(o: Obstacles, x: number, z: number, farFromEdges = false): boolean {
  if (farFromEdges) {
    const i = Math.floor((x - o.minX) / MASK_CELL);
    const j = Math.floor((z - o.minZ) / MASK_CELL);
    if (i >= 0 && i < o.maskNX && j >= 0 && j < o.maskNZ) return o.mask[j * o.maskNX + i] === 1;
  }
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
  return insideArea(o, x, z, c >= MASK_SAFE) ? -c : c;
}

/** Exact nearest cell via a grid of cell centres; falls back to a full scan far from every cell. */
function cellFinder(cellX: Float32Array, cellZ: Float32Array, spacing: number, bounds: CityLayout["bounds"]): (x: number, z: number) => number {
  const grid = new Grid(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, spacing);
  for (let c = 0; c < cellX.length; c++) grid.add(cellX[c], cellZ[c], cellX[c], cellZ[c], c);
  const reach = spacing;
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
 * Chooses PADS_PER_CELL landmark pads per cell and sizes each one.
 *
 * Candidates lie on a coarse city-wide grid, in the cell's region: within `spacing` of its centre, and nearest to
 * it give or take PAD_BORROW. The fit of a spot is the largest landmark radius that clears roads,
 * water, parks and the city edge, capped at the full LANDMARK_SCALE size.
 *
 * 1. Place: pads are picked one at a time, each at the spot with the most room (its fit, less what
 *    placed pads' landmarks need, keeping PAD_GAP). Ties go to the larger fit, then to the spot
 *    nearest the centre, so open cells keep full-size pads near the centre. A pattern search refines
 *    the winner.
 * 2. Repair: big early pads can crowd later ones out of tight blocks. A pad that cannot fit even
 *    MIN_LANDMARK_SCALE moves to a spot that fits it at that scale, assuming its neighbours shrink to
 *    that scale too, and they shrink as far as needed.
 * 3. Grow: every pad grows into the room its neighbours and the streets leave it.
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
}): { pads: Float32Array; padScale: Float32Array; crampedPads: number } {
  const nC = cellX.length;
  const nPads = nC * PADS_PER_CELL;
  const pads = new Float32Array(nPads * 2);
  const padRadius = new Float64Array(nPads);
  const cramped = new Uint8Array(nPads);
  const reach = 2 * FULL_PAD_RADIUS + PAD_GAP;
  const placed = new Grid(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, reach);
  const borrow = PAD_BORROW * spacing;

  // A point within half a cell's nearest-neighbour distance (plus half the borrow) is always its own.
  const quick = new Float64Array(nC);
  for (let c = 0; c < nC; c++) {
    let nn = Infinity;
    for (let j = 0; j < nC; j++) if (j !== c) nn = Math.min(nn, Math.hypot(cellX[c] - cellX[j], cellZ[c] - cellZ[j]));
    quick[c] = (nn + borrow) / 2;
  }
  const owns = (c: number, x: number, z: number): boolean => {
    const d = Math.hypot(x - cellX[c], z - cellZ[c]);
    if (d <= quick[c]) return true;
    const n = nearest(x, z);
    return n === c || d - Math.hypot(x - cellX[n], z - cellZ[n]) <= borrow;
  };

  // One coarse lattice over the city, shared by neighbouring cells, so each spot's fit is measured once.
  const latNX = Math.max(1, Math.floor((bounds.maxX - bounds.minX) / PAD_STEP));
  const latNZ = Math.max(1, Math.floor((bounds.maxZ - bounds.minZ) / PAD_STEP));
  const latX = (i: number) => Math.fround(bounds.minX + (i + 0.5) * PAD_STEP);
  const latZ = (j: number) => Math.fround(bounds.minZ + (j + 0.5) * PAD_STEP);
  const latFit = new Float64Array(latNX * latNZ).fill(NaN);
  const MEMO_ROW = Math.ceil((bounds.maxZ - bounds.minZ) / PAD_REFINE_STEP) + 64;
  // Road room at every lattice spot, splatted segment by segment (each touches only the spots it can reach).
  const latRoad = new Float64Array(latNX * latNZ).fill(FULL_PAD_RADIUS);
  const segs = obstacles.segs;
  for (let k = 0; k < segs.length; k += 5) {
    const [ax, az, bx, bz, half] = [segs[k], segs[k + 1], segs[k + 2], segs[k + 3], segs[k + 4]];
    const r = FULL_PAD_RADIUS + half;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx) - r - bounds.minX) / PAD_STEP - 0.5));
    const i1 = Math.min(latNX - 1, Math.floor((Math.max(ax, bx) + r - bounds.minX) / PAD_STEP - 0.5));
    const j0 = Math.max(0, Math.ceil((Math.min(az, bz) - r - bounds.minZ) / PAD_STEP - 0.5));
    const j1 = Math.min(latNZ - 1, Math.floor((Math.max(az, bz) + r - bounds.minZ) / PAD_STEP - 0.5));
    for (let j = j0; j <= j1; j++) {
      const z = latZ(j);
      for (let i = i0; i <= i1; i++) {
        const d = segDist(latX(i), z, ax, az, bx, bz) - half;
        if (d < latRoad[j * latNX + i]) latRoad[j * latNX + i] = d;
      }
    }
  }

  const fit = (x: number, z: number): number => {
    let room = Math.min(FULL_PAD_RADIUS, x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z);
    room = roadRoom(obstacles, x, z, room);
    return room > 0 ? areaRoom(obstacles, x, z, room) : room;
  };
  /**
   * `limit`, capped by the room placed pads (except `skip`) leave at (x, z), keeping PAD_GAP. Each pad
   * counts at radius `assume` if given (the size it could shrink to), else at its own.
   */
  const apart = (x: number, z: number, limit: number, skip = -1, assume = -1): number => {
    let r = limit;
    placed.forEachNear(x, z, reach, (k) => {
      if (k === skip) return;
      const d = Math.hypot(pads[k * 2] - x, pads[k * 2 + 1] - z) - (assume >= 0 ? assume : padRadius[k]) - PAD_GAP;
      if (d < r) r = d;
    });
    return r;
  };

  // Lattice offsets nearest-first, shared by every cell (anchored at the lattice spot nearest its centre).
  const template: number[] = [];
  {
    const n = Math.ceil(spacing / PAD_STEP) + 1;
    const offs: [number, number, number][] = [];
    for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) offs.push([di, dj, Math.hypot(di, dj)]);
    offs.sort((u, v) => u[2] - v[2]); // stable: ties keep row-major order
    for (const [di, dj] of offs) template.push(di, dj);
  }
  /**
   * A cell's lattice spots (nearest its centre first, with their lattice index for the shared fit),
   * listed lazily: `more(i)` extends the list until it has spot i, or reports there is none.
   */
  type Candidates = { x: number[]; z: number[]; at: number[]; more: (i: number) => boolean; byFit: number[] | null; memo: Map<number, number> };
  const perCell: (Candidates | undefined)[] = new Array(nC);
  const candidates = (c: number): Candidates => {
    const cs = perCell[c];
    if (cs) return cs;
    const ia = Math.floor((cellX[c] - bounds.minX) / PAD_STEP);
    const ja = Math.floor((cellZ[c] - bounds.minZ) / PAD_STEP);
    let t = 0;
    const list: Candidates = {
      x: [],
      z: [],
      at: [],
      more: (i) => {
        while (list.x.length <= i && t < template.length) {
          const li = ia + template[t];
          const lj = ja + template[t + 1];
          t += 2;
          if (li < 0 || li >= latNX || lj < 0 || lj >= latNZ) continue;
          const x = latX(li);
          const z = latZ(lj);
          if (Math.hypot(x - cellX[c], z - cellZ[c]) > spacing || !owns(c, x, z)) continue;
          list.x.push(x);
          list.z.push(z);
          list.at.push(lj * latNX + li);
        }
        return list.x.length > i;
      },
      byFit: null,
      memo: new Map(),
    };
    perCell[c] = list;
    return list;
  };

  /**
   * The spot in cell c's region that maximises min(fit, room(x, z, ·), target), where room(x, z, limit)
   * caps `limit` by the space other pads leave. Ties go to the larger fit, then nearer the centre.
   * Returns x, z and that room.
   */
  const search = (c: number, target: number, room: (x: number, z: number, limit: number) => number): [number, number, number] => {
    const cs = candidates(c);
    const fitAt = (i: number) => {
      const k = cs.at[i];
      if (Number.isNaN(latFit[k])) {
        const [x, z] = [cs.x[i], cs.z[i]];
        const room = Math.min(latRoad[k], x - bounds.minX, bounds.maxX - x, z - bounds.minZ, bounds.maxZ - z);
        latFit[k] = room > 0 ? areaRoom(obstacles, x, z, room) : room;
      }
      return latFit[k];
    };
    let best = -Infinity;
    let bx = Math.fround(cellX[c]);
    let bz = Math.fround(cellZ[c]);
    if (target === FULL_PAD_RADIUS) {
      // Nothing beats a full-size spot, and the nearest one wins ties: scan nearest-first, lazily.
      for (let i = 0; cs.more(i); i++) {
        if (fitAt(i) < target || room(cs.x[i], cs.z[i], target) < target) continue;
        best = target;
        bx = cs.x[i];
        bz = cs.z[i];
        break;
      }
    }
    if (best < target) {
      if (!cs.byFit) {
        cs.more(Infinity);
        const f = Float64Array.from(cs.x, (_, i) => fitAt(i));
        cs.byFit = Array.from(f, (_, i) => i).sort((a, b) => f[b] - f[a]); // stable: ties stay nearest-first
      }
      for (const i of cs.byFit) {
        // Sorted by fit, and the room is never more than the fit: later spots cannot win.
        const f = Math.min(fitAt(i), target);
        if (f <= best) break;
        const r = room(cs.x[i], cs.z[i], f);
        if (r > best) {
          best = r;
          bx = cs.x[i];
          bz = cs.z[i];
        }
      }
    }
    if (best === -Infinity) best = room(bx, bz, Math.min(fit(bx, bz), target));
    const fitHere = (x: number, z: number): number => {
      // Refined spots sit on a PAD_REFINE_STEP grid around lattice spots, so this key is exact.
      const key = Math.round((x - bounds.minX) / PAD_REFINE_STEP) * MEMO_ROW + Math.round((z - bounds.minZ) / PAD_REFINE_STEP);
      let f = cs.memo.get(key);
      if (f === undefined) cs.memo.set(key, (f = fit(x, z)));
      return f;
    };
    /** Pattern search: step to the best of the 8 neighbours while that gains room, then halve the step. */
    const refine = (x1: number, z1: number, r1: number): [number, number, number] => {
      for (let step = PAD_STEP / 2; r1 < target && step >= PAD_REFINE_STEP; ) {
        let moved = false;
        const [x0, z0] = [x1, z1];
        for (const [ox, oz] of NEIGHBOURS) {
          const x = Math.fround(x0 + ox * step);
          const z = Math.fround(z0 + oz * step);
          const f = Math.min(fitHere(x, z), target);
          if (f <= r1 || !owns(c, x, z)) continue;
          const r = room(x, z, f);
          if (r > r1) {
            r1 = r;
            x1 = x;
            z1 = z;
            moved = true;
          }
        }
        if (!moved) step /= 2;
      }
      return [x1, z1, r1];
    };
    [bx, bz, best] = refine(bx, bz, best);
    if (best < MIN_PAD_RADIUS && cs.byFit) {
      // About to be cramped: the fitting spot may be a narrow one the coarse grid straddles, so refine
      // the next most promising spots too.
      const seeds: [number, number, number][] = [];
      for (const i of cs.byFit) {
        const f = Math.min(fitAt(i), target);
        if (seeds.length === PAD_SEEDS && f <= seeds[PAD_SEEDS - 1][2]) break;
        const r = room(cs.x[i], cs.z[i], f);
        if (seeds.length === PAD_SEEDS && r <= seeds[PAD_SEEDS - 1][2]) continue;
        seeds.push([cs.x[i], cs.z[i], r]);
        seeds.sort((u, v) => v[2] - u[2]);
        if (seeds.length > PAD_SEEDS) seeds.pop();
      }
      for (const [x, z, r] of seeds) {
        const tried = refine(x, z, r);
        if (tried[2] > best) [bx, bz, best] = tried;
        if (best >= MIN_PAD_RADIUS) break;
      }
    }
    return [bx, bz, best];
  };

  // 1. Place.
  for (let c = 0; c < nC; c++) {
    for (let k = 0; k < PADS_PER_CELL; k++) {
      const p = c * PADS_PER_CELL + k;
      const [x, z, r] = search(c, FULL_PAD_RADIUS, (px, pz, limit) => apart(px, pz, limit));
      pads[p * 2] = x;
      pads[p * 2 + 1] = z;
      // A cramped pad still draws at MIN_LANDMARK_SCALE, so later pads keep clear of that size.
      padRadius[p] = Math.max(r, MIN_PAD_RADIUS);
      cramped[p] = r < MIN_PAD_RADIUS ? 1 : 0;
      placed.add(x, z, x, z, p);
    }
  }

  // 2. Repair.
  for (let p = 0; p < nPads; p++) {
    if (!cramped[p]) continue;
    const [x, z, r] = search(Math.floor(p / PADS_PER_CELL), MIN_PAD_RADIUS, (px, pz, limit) => apart(px, pz, limit, p, MIN_PAD_RADIUS));
    if (r < MIN_PAD_RADIUS) continue;
    pads[p * 2] = x;
    pads[p * 2 + 1] = z;
    padRadius[p] = MIN_PAD_RADIUS;
    cramped[p] = 0;
    // The old grid entry goes stale; queries read positions from `pads`, so only the new one matters.
    placed.add(x, z, x, z, p);
    placed.forEachNear(x, z, reach, (q) => {
      if (q !== p) padRadius[q] = Math.min(padRadius[q], Math.hypot(pads[q * 2] - x, pads[q * 2 + 1] - z) - MIN_PAD_RADIUS - PAD_GAP);
    });
  }

  // 3. Grow.
  const padScale = new Float32Array(nPads);
  let crampedPads = 0;
  for (let p = 0; p < nPads; p++) {
    const x = pads[p * 2];
    const z = pads[p * 2 + 1];
    if (cramped[p]) crampedPads++;
    else padRadius[p] = Math.max(padRadius[p], apart(x, z, fit(x, z), p));
    padScale[p] = Math.min(LANDMARK_SCALE, Math.max(MIN_LANDMARK_SCALE, padRadius[p] / MAX_LANDMARK_RADIUS));
    padRadius[p] = padScale[p] * MAX_LANDMARK_RADIUS;
  }
  return { pads, padScale, crampedPads };
}

/**
 * Deterministic city layout in scene units. Buildings are rejection-sampled across the city:
 * acceptance rises with the density of the nearest cell. Each candidate footprint shrinks (keeping
 * its proportions) to fit the room left by roads, water, parks and landmark pads, so footprints follow
 * the street grain; it is dropped if a side would fall below MIN_BUILDING_SIDE or it would touch an
 * earlier building. Heights grow with density.
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
  const { pads, padScale, crampedPads } = placePads({ cellX, cellZ, spacing, bounds, obstacles, nearest });
  const nPads = padScale.length;
  const padGrid = new Grid(bounds.minX, bounds.minZ, bounds.maxX, bounds.maxZ, FULL_PAD_RADIUS);
  for (let i = 0; i < nPads; i++) padGrid.add(pads[i * 2], pads[i * 2 + 1], pads[i * 2], pads[i * 2 + 1], i);

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
    const x = Math.fround(bounds.minX + rng.next() * (bounds.maxX - bounds.minX));
    const z = Math.fround(bounds.minZ + rng.next() * (bounds.maxZ - bounds.minZ));
    const w0 = 3 + rng.next() * 4;
    const d0 = 3 + rng.next() * 4;
    const heightRoll = rng.next();
    const acceptRoll = rng.next();

    const cell = nearest(x, z);
    if (Math.hypot(cellX[cell] - x, cellZ[cell] - z) > spacing) continue;
    const dn = norm(cell);
    if (acceptRoll > 0.35 + 0.65 * dn) continue;

    const full = Math.hypot(w0, d0) / 2;
    /** Smallest radius that keeps both sides at least MIN_BUILDING_SIDE. */
    const least = (full * MIN_BUILDING_SIDE) / Math.min(w0, d0);
    let room = roadRoom(obstacles, x, z, full);
    if (room < least) continue;
    room = areaRoom(obstacles, x, z, room);
    if (room < least) continue;
    padGrid.forEachNear(x, z, room + FULL_PAD_RADIUS + PAD_MARGIN, (p) => {
      const d = Math.hypot(pads[p * 2] - x, pads[p * 2 + 1] - z) - padScale[p] * MAX_LANDMARK_RADIUS - PAD_MARGIN;
      if (d < room) room = d;
    });
    if (room < least) continue;
    // A hair under the room, so float32 storage cannot push the footprint over it.
    const shrink = room >= full ? 1 : (room - 1e-4) / full;
    const radius = full * shrink;
    let blocked = false;
    buildingGrid.forEachNear(x, z, radius + MAX_BUILDING_RADIUS + BUILDING_GAP, (j) => {
      if (Math.hypot(bx[j] - x, bz[j] - z) < radius + br[j] + BUILDING_GAP) blocked = true;
    });
    if (blocked) continue;

    bx[count] = x;
    bz[count] = z;
    bw[count] = w0 * shrink;
    bd[count] = d0 * shrink;
    const h = 1.5 + heightRoll * heightRoll * (3 + 16 * dn * dn);
    // Keep small footprints from turning into needles.
    bh[count] = Math.min(h, 2 + 6 * Math.min(bw[count], bd[count]));
    bs[count] = hash01(t + seed * 7919);
    br[count] = Math.hypot(bw[count], bd[count]) / 2;
    buildingGrid.add(x - br[count], z - br[count], x + br[count], z + br[count], count);
    count++;
  }

  return {
    bounds,
    center: { x: (bounds.minX + bounds.maxX) / 2, z: (bounds.minZ + bounds.maxZ) / 2 },
    spacing,
    cellX,
    cellZ,
    pads,
    padScale,
    crampedPads,
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
