import type { XZ } from "@/render/layout";

/** Street network: nodes with CSR adjacency; edge lengths in scene units. */
export type RoadGraph = {
  nodeX: Float32Array;
  nodeZ: Float32Array;
  offsets: Int32Array;
  targets: Int32Array;
  lengths: Float32Array;
  /** Uniform grid of node indices for nearest-node lookups. */
  cellSize: number;
  buckets: Map<string, number[]>;
};

const SNAP = 0.5;
const SPLIT_TOLERANCE = 1.5;
const BUCKET = 8;

const keyOf = (x: number, z: number) => `${Math.round(x / SNAP)},${Math.round(z / SNAP)}`;

/**
 * Builds a routable graph from road polylines. Shared vertices merge into junctions. A dangling
 * end lying on another road's segment (within SPLIT_TOLERANCE) splits that segment, which
 * reconnects T-junctions whose shared vertex was removed by simplification. Only the largest
 * connected component is kept.
 */
export function buildRoadGraph(roads: { points: XZ[] }[]): RoadGraph {
  const xs: number[] = [];
  const zs: number[] = [];
  const ids = new Map<string, number>();
  const node = (x: number, z: number) => {
    const k = keyOf(x, z);
    let id = ids.get(k);
    if (id === undefined) {
      id = xs.length;
      ids.set(k, id);
      xs.push(x);
      zs.push(z);
    }
    return id;
  };

  type Seg = { a: number; b: number; road: number };
  const segs: Seg[] = [];
  roads.forEach((r, road) => {
    for (let i = 0; i + 1 < r.points.length; i++) {
      const a = node(r.points[i][0], r.points[i][1]);
      const b = node(r.points[i + 1][0], r.points[i + 1][1]);
      if (a !== b) segs.push({ a, b, road });
    }
  });

  const degree = new Int32Array(xs.length);
  for (const s of segs) {
    degree[s.a]++;
    degree[s.b]++;
  }
  const segHash = new Map<string, number[]>();
  const bucket = (x: number, z: number) => `${Math.floor(x / BUCKET)},${Math.floor(z / BUCKET)}`;
  segs.forEach((s, i) => {
    const x0 = Math.min(xs[s.a], xs[s.b]) - SPLIT_TOLERANCE;
    const x1 = Math.max(xs[s.a], xs[s.b]) + SPLIT_TOLERANCE;
    const z0 = Math.min(zs[s.a], zs[s.b]) - SPLIT_TOLERANCE;
    const z1 = Math.max(zs[s.a], zs[s.b]) + SPLIT_TOLERANCE;
    for (let bx = Math.floor(x0 / BUCKET); bx <= Math.floor(x1 / BUCKET); bx++) {
      for (let bz = Math.floor(z0 / BUCKET); bz <= Math.floor(z1 / BUCKET); bz++) {
        const k = `${bx},${bz}`;
        const list = segHash.get(k);
        if (list) list.push(i);
        else segHash.set(k, [i]);
      }
    }
  });
  const splits = new Map<number, { t: number; node: number }[]>();
  const nodeRoads = new Map<number, Set<number>>();
  for (const s of segs) {
    for (const n of [s.a, s.b]) {
      const set = nodeRoads.get(n) ?? new Set<number>();
      set.add(s.road);
      nodeRoads.set(n, set);
    }
  }
  for (let n = 0; n < xs.length; n++) {
    if (degree[n] !== 1) continue;
    const own = nodeRoads.get(n) ?? new Set<number>();
    let best: { seg: number; t: number; d: number } | null = null;
    for (const si of segHash.get(bucket(xs[n], zs[n])) ?? []) {
      const s = segs[si];
      if (own.has(s.road) || s.a === n || s.b === n) continue;
      const dx = xs[s.b] - xs[s.a];
      const dz = zs[s.b] - zs[s.a];
      const len2 = dx * dx + dz * dz;
      const t = Math.max(0, Math.min(1, ((xs[n] - xs[s.a]) * dx + (zs[n] - zs[s.a]) * dz) / len2));
      const d = Math.hypot(xs[n] - (xs[s.a] + t * dx), zs[n] - (zs[s.a] + t * dz));
      if (d <= SPLIT_TOLERANCE && (!best || d < best.d)) best = { seg: si, t, d };
    }
    if (best) {
      const list = splits.get(best.seg) ?? [];
      list.push({ t: best.t, node: n });
      splits.set(best.seg, list);
    }
  }

  const edges: [number, number][] = [];
  segs.forEach((s, i) => {
    const chain = [s.a, ...(splits.get(i) ?? []).sort((p, q) => p.t - q.t).map((p) => p.node), s.b];
    for (let k = 0; k + 1 < chain.length; k++) if (chain[k] !== chain[k + 1]) edges.push([chain[k], chain[k + 1]]);
  });

  // Largest connected component (union-find).
  const parent = Int32Array.from({ length: xs.length }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]];
      i = parent[i];
    }
    return i;
  };
  for (const [a, b] of edges) parent[find(a)] = find(b);
  const size = new Map<number, number>();
  for (let i = 0; i < xs.length; i++) size.set(find(i), (size.get(find(i)) ?? 0) + 1);
  let root = -1;
  let rootSize = 0;
  for (const [r, s] of size) if (s > rootSize || (s === rootSize && r < root)) [root, rootSize] = [r, s];

  const remap = new Int32Array(xs.length).fill(-1);
  const keptX: number[] = [];
  const keptZ: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (find(i) !== root) continue;
    remap[i] = keptX.length;
    keptX.push(xs[i]);
    keptZ.push(zs[i]);
  }
  const adj: { to: number; len: number }[][] = Array.from({ length: keptX.length }, () => []);
  for (const [a0, b0] of edges) {
    const a = remap[a0];
    const b = remap[b0];
    if (a < 0 || b < 0) continue;
    const len = Math.hypot(keptX[b] - keptX[a], keptZ[b] - keptZ[a]);
    adj[a].push({ to: b, len });
    adj[b].push({ to: a, len });
  }
  const offsets = new Int32Array(keptX.length + 1);
  for (let i = 0; i < keptX.length; i++) offsets[i + 1] = offsets[i] + adj[i].length;
  const targets = new Int32Array(offsets[keptX.length]);
  const lengths = new Float32Array(offsets[keptX.length]);
  adj.forEach((list, i) => list.forEach((e, k) => {
    targets[offsets[i] + k] = e.to;
    lengths[offsets[i] + k] = e.len;
  }));

  const buckets = new Map<string, number[]>();
  for (let i = 0; i < keptX.length; i++) {
    const k = bucket(keptX[i], keptZ[i]);
    const list = buckets.get(k);
    if (list) list.push(i);
    else buckets.set(k, [i]);
  }
  return { nodeX: Float32Array.from(keptX), nodeZ: Float32Array.from(keptZ), offsets, targets, lengths, cellSize: BUCKET, buckets };
}

/** Nearest graph node to (x, z), searching outward ring by ring through the bucket grid. */
export function nearestNode(g: RoadGraph, x: number, z: number): number {
  const bx = Math.floor(x / g.cellSize);
  const bz = Math.floor(z / g.cellSize);
  let best = -1;
  let bestD = Infinity;
  for (let r = 0; r < 4096; r++) {
    for (let i = bx - r; i <= bx + r; i++) {
      for (let j = bz - r; j <= bz + r; j++) {
        if (Math.max(Math.abs(i - bx), Math.abs(j - bz)) !== r) continue;
        for (const n of g.buckets.get(`${i},${j}`) ?? []) {
          const d = (g.nodeX[n] - x) ** 2 + (g.nodeZ[n] - z) ** 2;
          if (d < bestD) {
            bestD = d;
            best = n;
          }
        }
      }
    }
    if (best >= 0 && Math.sqrt(bestD) <= r * g.cellSize) return best;
    if (r * g.cellSize > 1e5) break;
  }
  return best;
}

/** Lazily built Dijkstra shortest-path trees, one per destination node; tree[n] = next node towards the root. */
export class RouteBook {
  treesBuilt = 0;
  private readonly trees = new Map<number, Int32Array>();
  constructor(readonly graph: RoadGraph) {}

  treeTo(root: number): Int32Array {
    let tree = this.trees.get(root);
    if (tree) return tree;
    const g = this.graph;
    const n = g.nodeX.length;
    const dist = new Float64Array(n).fill(Infinity);
    tree = new Int32Array(n).fill(-1);
    const heap: number[] = [root];
    dist[root] = 0;
    const less = (a: number, b: number) => dist[a] < dist[b];
    const push = (v: number) => {
      heap.push(v);
      for (let i = heap.length - 1; i > 0; ) {
        const p = (i - 1) >> 1;
        if (!less(heap[i], heap[p])) break;
        [heap[i], heap[p]] = [heap[p], heap[i]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop() as number;
      if (heap.length > 0) {
        heap[0] = last;
        for (let i = 0; ; ) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && less(heap[l], heap[m])) m = l;
          if (r < heap.length && less(heap[r], heap[m])) m = r;
          if (m === i) break;
          [heap[i], heap[m]] = [heap[m], heap[i]];
          i = m;
        }
      }
      return top;
    };
    const done = new Uint8Array(n);
    while (heap.length > 0) {
      const u = pop();
      if (done[u]) continue;
      done[u] = 1;
      for (let e = g.offsets[u]; e < g.offsets[u + 1]; e++) {
        const v = g.targets[e];
        const d = dist[u] + g.lengths[e];
        if (d < dist[v]) {
          dist[v] = d;
          tree[v] = u;
          push(v);
        }
      }
    }
    this.trees.set(root, tree);
    this.treesBuilt++;
    return tree;
  }

  /** Drops cached trees (e.g. when the graph's venues change a lot); routes rebuild lazily. */
  clear(): void {
    this.trees.clear();
  }
}

/** Street route from `from` to `to` as a flat (x, z, …) polyline: from → nearest node → … → node nearest `to` → to. */
export function routePolyline(book: RouteBook, from: XZ, to: XZ): Float32Array {
  const g = book.graph;
  const start = nearestNode(g, from[0], from[1]);
  const end = nearestNode(g, to[0], to[1]);
  const out: number[] = [from[0], from[1]];
  if (start >= 0 && end >= 0) {
    const tree = book.treeTo(end);
    let n = start;
    let guard = 0;
    while (n >= 0 && guard++ < 100_000) {
      out.push(g.nodeX[n], g.nodeZ[n]);
      if (n === end) break;
      n = tree[n];
    }
  }
  out.push(to[0], to[1]);
  return Float32Array.from(out);
}

/** Arc-length sampling of flat (x, z, …) polylines. */
export const samplePolyline = {
  prepare(poly: Float32Array): { cum: Float32Array; total: number } {
    const n = poly.length / 2;
    const cum = new Float32Array(n);
    for (let i = 1; i < n; i++) cum[i] = cum[i - 1] + Math.hypot(poly[2 * i] - poly[2 * i - 2], poly[2 * i + 1] - poly[2 * i - 1]);
    return { cum, total: cum[n - 1] ?? 0 };
  },
  /** Point at fraction f ∈ [0, 1] of the total length. */
  at(poly: Float32Array, cum: Float32Array, f: number): [number, number] {
    const n = poly.length / 2;
    const total = cum[n - 1];
    if (n === 1 || total === 0) return [poly[0], poly[1]];
    const d = Math.max(0, Math.min(1, f)) * total;
    let lo = 0;
    let hi = n - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] <= d) lo = mid;
      else hi = mid;
    }
    const seg = cum[hi] - cum[lo];
    const k = seg > 0 ? (d - cum[lo]) / seg : 0;
    return [poly[2 * lo] + (poly[2 * hi] - poly[2 * lo]) * k, poly[2 * lo + 1] + (poly[2 * hi + 1] - poly[2 * lo + 1]) * k];
  },
};
