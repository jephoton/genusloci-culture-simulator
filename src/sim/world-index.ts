import type { World } from "@/world/schema";

export const DEFAULT_VENUE_CAPACITY = 100;

/** Read-only typed-array view of a World, built once and shared by all states. */
export type CompiledWorld = {
  world: World;
  nEntities: number;
  /** CSR adjacency: row i spans edgeOffsets[i]..edgeOffsets[i+1]; targets sorted ascending. */
  edgeOffsets: Int32Array;
  edgeTargets: Int32Array;
  edgeWeights: Float32Array;
  /** Venue slot -> entity index. */
  venues: Int32Array;
  venueCell: Int32Array;
  venueCapacity: Float32Array;
  /** Dense nVenues × nEntities: 1 for the venue itself, else edge weight venue→entity. */
  venueProfile: Float32Array;
  /** Per cell: venue slots sorted by distance, at most maxNearby. */
  nearbyVenues: Int32Array[];
  cellLat: Float64Array;
  cellLon: Float64Array;
};

type EdgeIndex = Pick<CompiledWorld, "edgeOffsets" | "edgeTargets" | "edgeWeights">;
type CellIndex = Pick<CompiledWorld, "cellLat" | "cellLon">;

/** Affinity weight of the edge from → to, or 0 if none (binary search). */
export function edgeWeight(cw: EdgeIndex, from: number, to: number): number {
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

export function compileWorld(world: World, maxNearby = 12): CompiledWorld {
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

  const venueList: number[] = [];
  world.entities.forEach((e, i) => {
    if (e.type === "place" && e.cell !== undefined) venueList.push(i);
  });
  const venues = Int32Array.from(venueList);
  const venueCell = Int32Array.from(venueList.map((i) => world.entities[i].cell as number));
  const venueCapacity = Float32Array.from(
    venueList.map((i) => world.entities[i].capacity ?? DEFAULT_VENUE_CAPACITY),
  );

  const venueProfile = new Float32Array(venues.length * n);
  venues.forEach((ent, v) => {
    const row = v * n;
    for (let j = edgeOffsets[ent]; j < edgeOffsets[ent + 1]; j++) {
      venueProfile[row + edgeTargets[j]] = edgeWeights[j];
    }
    venueProfile[row + ent] = 1;
  });

  const cells: CellIndex = {
    cellLat: Float64Array.from(world.cells.map((c) => c.lat)),
    cellLon: Float64Array.from(world.cells.map((c) => c.lon)),
  };
  const slots = Array.from({ length: venues.length }, (_, v) => v);
  const nearbyVenues = world.cells.map((_, c) => {
    const order = [...slots].sort(
      (a, b) => distKm(cells, c, venueCell[a]) - distKm(cells, c, venueCell[b]) || a - b,
    );
    return Int32Array.from(order.slice(0, maxNearby));
  });

  return {
    world, nEntities: n, edgeOffsets, edgeTargets, edgeWeights,
    venues, venueCell, venueCapacity, venueProfile, nearbyVenues, ...cells,
  };
}
