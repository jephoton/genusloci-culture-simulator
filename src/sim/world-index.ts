import type { World } from "@/world/schema";

export const DEFAULT_VENUE_CAPACITY = 100;

/** Read-only typed-array view of a World's taste graph and geography, shared by all states. */
export type CompiledWorld = {
  world: World;
  nEntities: number;
  nCells: number;
  /** CSR adjacency: row i spans edgeOffsets[i]..edgeOffsets[i+1]; targets sorted ascending. */
  edgeOffsets: Int32Array;
  edgeTargets: Int32Array;
  edgeWeights: Float32Array;
  /** Entity indices of type "place": candidates for new venues. */
  places: Int32Array;
  cellLat: Float64Array;
  cellLon: Float64Array;
};

type EdgeIndex = Pick<CompiledWorld, "nEntities" | "edgeOffsets" | "edgeTargets" | "edgeWeights">;
type CellIndex = Pick<CompiledWorld, "cellLat" | "cellLon">;

/** Affinity weight of the edge from → to, or 0 if none (binary search). */
export function edgeWeight(cw: Pick<CompiledWorld, "edgeOffsets" | "edgeTargets" | "edgeWeights">, from: number, to: number): number {
  let lo = cw.edgeOffsets[from];
  let hi = cw.edgeOffsets[from + 1] - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const t = cw.edgeTargets[mid];
    if (t === to) return cw.edgeWeights[mid];
    if (t < to) lo = mid + 1;
    else hi = mid - 1;
  }
  return 0;
}

/** Equirectangular distance between two cell centres, in km (accurate enough at city scale). */
export function distKm(cw: CellIndex, a: number, b: number): number {
  const toRad = Math.PI / 180;
  const lat1 = cw.cellLat[a] * toRad;
  const lat2 = cw.cellLat[b] * toRad;
  const x = (cw.cellLon[b] - cw.cellLon[a]) * toRad * Math.cos((lat1 + lat2) / 2);
  const y = lat2 - lat1;
  return 6371 * Math.sqrt(x * x + y * y);
}

/** Writes the venue profile of `entity` into out[offset, offset + nEntities): 1 for itself, else edge weight entity→e. */
export function writeVenueProfile(cw: EdgeIndex, entity: number, out: Float32Array, offset: number): void {
  out.fill(0, offset, offset + cw.nEntities);
  for (let j = cw.edgeOffsets[entity]; j < cw.edgeOffsets[entity + 1]; j++) {
    out[offset + cw.edgeTargets[j]] = cw.edgeWeights[j];
  }
  out[offset + entity] = 1;
}

export function compileWorld(world: World): CompiledWorld {
  const n = world.entities.length;

  const rows: Map<number, number>[] = Array.from({ length: n }, () => new Map());
  for (const e of world.edges) {
    if (e.source === e.target || e.weight <= 0) continue;
    const row = rows[e.source];
    row.set(e.target, Math.max(row.get(e.target) ?? 0, e.weight));
  }
  const edgeOffsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) edgeOffsets[i + 1] = edgeOffsets[i] + rows[i].size;
  const edgeTargets = new Int32Array(edgeOffsets[n]);
  const edgeWeights = new Float32Array(edgeOffsets[n]);
  for (let i = 0; i < n; i++) {
    const sorted = [...rows[i].entries()].sort((a, b) => a[0] - b[0]);
    sorted.forEach(([t, w], j) => {
      edgeTargets[edgeOffsets[i] + j] = t;
      edgeWeights[edgeOffsets[i] + j] = w;
    });
  }

  const places = Int32Array.from(world.entities.flatMap((e, i) => (e.type === "place" ? [i] : [])));

  return {
    world,
    nEntities: n,
    nCells: world.cells.length,
    edgeOffsets,
    edgeTargets,
    edgeWeights,
    places,
    cellLat: Float64Array.from(world.cells.map((c) => c.lat)),
    cellLon: Float64Array.from(world.cells.map((c) => c.lon)),
  };
}
