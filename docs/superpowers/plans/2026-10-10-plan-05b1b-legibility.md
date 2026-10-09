# Plan 5b-1b: Legibility — Street Routing, Smaller City, Focus, Placement UX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the living city followable, based on user feedback after Plan 5b-1:
1. Agents walk along real streets, not straight lines.
2. Venues are always visible: no black bodies.
3. The city is smaller and denser: London at about ¼ of the area (1.5 km radius around Trafalgar Square) with about 2,500 residents.
4. Focus tools make one story at a time readable:
   - a scene legend whose hover or click highlights one scene and dims the rest;
   - selecting a venue highlights its visitors;
   - toasts for big moments, with a click-to-fly camera.
5. Opening a venue and throwing an event are understandable:
   - pick a kind or headliner;
   - a ghost follows the cursor;
   - click to place;
   - a confirmation toast appears.

**Architecture:**
- **Road graph:** built in the layout worker from `layout.roads`. Vertices are snapped together; dangling ends are split into the segments they touch, so junctions removed by simplification still connect. Only the largest connected component is kept.
- **`RouteBook`:** lazily computes and caches one Dijkstra shortest-path tree per venue anchor node. An agent's route is home → nearest node → tree path → venue spot, and the crowd samples it by arc length during the night out.
- **Focus:** UI state passed into the renderers (read through refs inside `useFrame`).
- **Toasts:** come from the same `FrameChange`s as the effects director.
- **Camera fly:** animates the MapControls target and position.

**Tech Stack:** as before.

**Context:** the user feedback in this session, `docs/current-state.md`, and the UI spec.

**Rules:**
- Atomic commits in Conventional Commits format; end each message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `pnpm test`, `pnpm exec tsc --noEmit` and `pnpm lint` before each commit (add `pnpm build` for render or UI tasks).
- Keep LF line endings.
- Mutate Three objects only through refs, effects or `useFrame`; no per-animation-frame React state.
- Read current files before editing; the code has moved on since earlier plans.

---

### Task 1: Smaller London, fewer residents

**Files:** modify `src/geo/cities.ts`, `public/geo/london.json` (regenerated), `src/ui/GameShell.tsx`.

- [ ] **Step 1: Shrink the area.** Set London's `radiusM` to `1500` in `src/geo/cities.ts`.
- [ ] **Step 2: Regenerate the geometry.** Run `pnpm build:geo london`. This makes one Overpass request; on a 429 or 504, wait 60 s and retry once. Then check it:
  ```bash
  node -e "const f=require('./public/geo/london.json');console.log(f.radiusM,f.geo.roads.length,f.geo.water.length,f.geo.parks.length)"
  ```
  Expected: `1500` and non-zero counts.
- [ ] **Step 3: Fewer residents.** In `src/ui/GameShell.tsx`, set `DEMO_CONFIG` to `{ nAgents: 2500, agentReserve: 300 }` and `AGENT_SLOTS` to `2800`.
- [ ] **Step 4: Check the synthetic city still works at this size.** `makeSyntheticCity` uses 500 m cells, so a 3 km square gives 36 cells minus water. If that leaves fewer than about 25 cells, pass `cellSizeM: 350` from `useCityWorld` and report it.
- [ ] **Step 5: Check the camera framing.** The opening shot in `CityCanvas` is based on the bounds, so check it frames the smaller city sensibly; adjust the factors if needed.
- [ ] **Step 6: Verify and commit.**
  - Run `pnpm test`, `tsc`, `lint` and `build`.
  - Commit 1: `feat(geo): focus London on a 1.5 km radius around Trafalgar Square` (cities and the regenerated JSON).
  - Commit 2: `fix(ui): reduce residents to 2,500 for the smaller city` (GameShell and any `useCityWorld` change).

---

### Task 2: Road graph and routes (pure, tested)

**Files:** create `src/render/routes.ts`; test `src/render/routes.test.ts`; modify `src/render/layout.ts` (add `graph` to `CityLayout`, built in `buildLayout`).

- [ ] **Step 1: Write the failing test**

`src/render/routes.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildRoadGraph, nearestNode, RouteBook, routePolyline, samplePolyline } from "@/render/routes";

// A 3×3 street grid with 10-unit blocks, plus a T-junction whose shared vertex was "simplified away":
// the stub ends at (5, 20) on the middle of the segment (0,20)-(10,20).
const grid = [
  { points: [[0, 0], [10, 0], [20, 0]] as [number, number][] },
  { points: [[0, 10], [10, 10], [20, 10]] as [number, number][] },
  { points: [[0, 20], [10, 20], [20, 20]] as [number, number][] },
  { points: [[0, 0], [0, 10], [0, 20]] as [number, number][] },
  { points: [[10, 0], [10, 10], [10, 20]] as [number, number][] },
  { points: [[20, 0], [20, 10], [20, 20]] as [number, number][] },
  { points: [[5, 30], [5, 20]] as [number, number][] },
  { points: [[100, 100], [110, 100]] as [number, number][] },
];

describe("buildRoadGraph", () => {
  const g = buildRoadGraph(grid);

  it("snaps shared vertices into junctions and splits segments where dangling ends touch them", () => {
    const stubEnd = nearestNode(g, 5, 20);
    expect(g.nodeX[stubEnd]).toBeCloseTo(5);
    expect(g.nodeZ[stubEnd]).toBeCloseTo(20);
    const degree = g.offsets[stubEnd + 1] - g.offsets[stubEnd];
    expect(degree).toBe(3);
  });

  it("keeps only the largest connected component", () => {
    const far = nearestNode(g, 105, 100);
    expect(Math.hypot(g.nodeX[far] - 105, g.nodeZ[far] - 100)).toBeGreaterThan(50);
  });
});

describe("routes", () => {
  const g = buildRoadGraph(grid);
  const book = new RouteBook(g);

  it("routes along streets from a home to a venue spot", () => {
    const poly = routePolyline(book, [1, -2], [19, 21]);
    expect(poly.length / 2).toBeGreaterThanOrEqual(4);
    expect([poly[0], poly[1]]).toEqual([1, -2]);
    expect([poly[poly.length - 2], poly[poly.length - 1]]).toEqual([19, 21]);
    for (let i = 2; i < poly.length - 2; i += 2) {
      const onStreet = poly[i] % 10 === 0 || poly[i + 1] % 10 === 0 || poly[i] === 5;
      expect(onStreet).toBe(true);
    }
  });

  it("reuses one shortest-path tree per destination node", () => {
    routePolyline(book, [1, 1], [19, 21]);
    routePolyline(book, [2, 9], [19, 21]);
    expect(book.treesBuilt).toBe(1);
  });

  it("samples a polyline by arc length", () => {
    const poly = Float32Array.from([0, 0, 10, 0, 10, 10]);
    const { cum, total } = samplePolyline.prepare(poly);
    expect(total).toBe(20);
    expect(samplePolyline.at(poly, cum, 0)).toEqual([0, 0]);
    expect(samplePolyline.at(poly, cum, 0.25)).toEqual([5, 0]);
    expect(samplePolyline.at(poly, cum, 0.75)).toEqual([10, 5]);
    expect(samplePolyline.at(poly, cum, 1)).toEqual([10, 10]);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/render/routes.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/render/routes.ts`:
```ts
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
```

- [ ] **Step 4: Run the test**

Run: `pnpm test src/render/routes.test.ts`
Expected: `6 passed`. If a grid assertion fails because of the snapping or split tolerance, debug it; don't loosen the assertions.

- [ ] **Step 5: Put the graph in the layout.**
  - Add `graph: RoadGraph` to `CityLayout`.
  - Build it at the end of `buildLayout` with `buildRoadGraph(roads)`.
  - The `Map` in `buckets` survives structured cloning from the layout worker. Confirm with a quick check that `useCityWorld`'s worker path still returns a usable layout.
  - Report the London graph's node count, edge count and build time.
  - Layout tests must still pass. Their deep-equality determinism checks cover the graph too, and it is deterministic.

- [ ] **Step 6: Verify and commit**
  - Run `pnpm test`, `tsc` and `lint`.
  - Commit: `feat(render): build a routable street graph with cached shortest-path trees`.

---

### Task 3: Crowds walk the streets

**Files:** modify `src/render/Crowd.tsx`.

Behaviour to implement:
- **Routes:** hold one `RouteBook` per layout in a ref; create it when the layout changes. On each new frame, for every agent going out, compute `routePolyline(book, home, venueSpot)`, plus its `samplePolyline.prepare`.
  - **Route cache:** keyed by (home node, venue spot rounded to 0.5 units), so agents from the same block heading to the same venue share one polyline.
  - **Per-agent storage:** a reference to the polyline plus its cumulative lengths, in a JS array on the motion ref. Typed arrays aren't required here.
- **Movement:** the outbound leg samples the route at `ease(out)`; the return leg samples it backwards at `1 − ease(back)`.
  - Agents staying in keep the current behaviour.
  - Keep the existing `fromX/fromZ` blending for the very start of the outbound leg: blend from the current position into the route over the first 10% of the leg. A rewind or late frame then never snaps.
- **Cost:** with about 2,500 agents and lazily built trees, the per-frame work stays a binary search per agent. Report the time to ingest a new frame (route building) on London, from a quick `performance.now()` log during development; remove the log before committing.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` and `pnpm build`.
- [ ] **Step 3:** Commit: `feat(render): walk crowds along the street network`.

---

### Task 4: Always-visible venues

**Files:** modify `src/render/Landmarks.tsx`.

- **Bodies:** use an emissive tint of the sign colour (`emissive = signColour × 0.18`, intensity 1) instead of plain near-black, so every landmark reads as a lit object.
  - **Lit band:** add one thin emissive band near the roofline in the sign colour at 0.6 strength.
  - **Empty venues:** they use a neutral warm colour, not near-zero.
  - **Closed venues:** dim to about 15% of this, but stay visible.
- **Implementation:** body materials are per landmark via `useMemo`; update their emissive colour in `useFrame`, not with React state each frame. Dispose of them on unmount.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` and `pnpm build`.
- [ ] **Step 3:** Commit: `fix(render): light venue bodies so empty venues stay visible`.

---

### Task 5: Placement UX for venues and events

**Files:**
- Create: `src/render/placement.ts` (pure entity choice) with its test, `src/render/Ghost.tsx`, `src/ui/Toasts.tsx`.
- Modify: `src/ui/Toolbar.tsx`, `src/ui/GameShell.tsx`, `src/render/Ground.tsx`, `src/render/CityCanvas.tsx`.

- [ ] **Step 1: Write the failing test** for the entity choice.

`src/render/placement.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { chooseVenueEntity } from "@/render/placement";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const clusterOf = (e: number) => Math.floor(e / 12);

describe("chooseVenueEntity", () => {
  it("picks a place of the requested kind that suits the cell's dominant scene", () => {
    for (let cell = 0; cell < world.cells.length; cell++) {
      const kinds = new Set(world.entities.filter((e) => e.type === "place").map((e) => e.kind));
      for (const kind of kinds) {
        const e = chooseVenueEntity(world, kind ?? "other", cell);
        expect(world.entities[e].type).toBe("place");
        expect(world.entities[e].kind).toBe(kind);
      }
    }
    const cell = world.cells.findIndex((c) => c.archetypes[0].weight > 0.5);
    const dominant = world.cells[cell].archetypes[0].archetype;
    const anyKind = world.entities.find((e) => e.type === "place" && clusterOf(world.entities.indexOf(e)) === dominant)?.kind ?? "other";
    expect(clusterOf(chooseVenueEntity(world, anyKind, cell))).toBe(dominant);
  });

  it("falls back to any place when no place has that kind", () => {
    const e = chooseVenueEntity(world, "stadium", 0);
    expect(world.entities[e].type).toBe("place");
  });
});
```
The fixture's kind assignment may give some kinds to only one cluster, which makes the dominant-cluster assertion vacuous. In that case, pick a kind that exists in the dominant cluster, as the test above does.

- [ ] **Step 2: Run it to verify it fails**, then implement `src/render/placement.ts`:
```ts
import type { VenueKind, World } from "@/world/schema";

/**
 * The real place entity to open when the user asks for a venue of `kind` in `cell`: among places of
 * that kind, the one whose taste links best to the cell's archetype mix (so a new venue suits its
 * neighbourhood). Falls back to the best place of any kind.
 */
export function chooseVenueEntity(world: World, kind: VenueKind, cell: number): number {
  const affinity = new Map<number, number>();
  const mix = world.cells[cell]?.archetypes ?? [];
  const geneWeight = new Map<number, number>();
  for (const { archetype, weight } of mix) {
    for (const g of world.archetypes[archetype].genes) geneWeight.set(g.entity, (geneWeight.get(g.entity) ?? 0) + weight * g.weight);
  }
  for (const e of world.edges) {
    const w = geneWeight.get(e.target);
    if (w !== undefined) affinity.set(e.source, (affinity.get(e.source) ?? 0) + w * e.weight);
  }
  let best = -1;
  let bestScore = -Infinity;
  let fallback = -1;
  let fallbackScore = -Infinity;
  world.entities.forEach((e, i) => {
    if (e.type !== "place") return;
    const score = affinity.get(i) ?? 0;
    if (score > fallbackScore) [fallback, fallbackScore] = [i, score];
    if ((e.kind ?? "other") === kind && score > bestScore) [best, bestScore] = [i, score];
  });
  return best >= 0 ? best : fallback;
}
```
Commit: `feat(render): choose a venue entity that suits its neighbourhood`.

- [ ] **Step 3: Redesign the toolbar** (`src/ui/Toolbar.tsx`):
  - **Tools:** "Select", "Open a venue" and "Throw an event".
  - **Open a venue:** shows a grid of venue kinds (club, bar, café, restaurant, gallery, music venue, shop, stadium) as labelled buttons. Choosing one enters placement mode: `{ kind: "open", venueKind }`. The kind is chosen here; the entity is chosen on placement with `chooseVenueEntity`.
  - **Throw an event:** shows the headliner list, grouped by scene and searchable with a plain filter input. Choosing one enters `{ kind: "event", entity }`.
  - **Step hints in plain words while placing:** "Move over the map and click where it should open. Esc cancels."
  - **Remove** the confusing "pick an entity first" flow.
- [ ] **Step 4: Add the ghost preview.**
  - `Ground.tsx` reports pointer-move points (throttled to animation frames) via a callback or ref.
  - New `src/render/Ghost.tsx` draws a translucent, pulsing preview at the cursor:
    - for venues: the chosen kind's footprint ring and a translucent body;
    - for events: a translucent beacon;
    - a highlight ring around the cell it will belong to.
  - Render it inside `CityCanvas` when a placement tool is active.
- [ ] **Step 5: Add toasts.**
  - New `src/ui/Toasts.tsx`: a stack (top-centre, max 4, auto-dismiss after about 4 s).
  - On a successful placement, show "Opened a {kind} in {nearest area}". Use "the city centre", "the north", etc. from the position relative to the centre; neighbourhood names come in 5b-2. For events, show "{headliner} is playing tonight".
  - Expose a `notify(message, anchor?)` function from `GameShell`; Task 6 reuses it.
- [ ] **Step 6:** Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` and `pnpm build`, then commit: `feat(ui): clear placement flow with kind picker, ghost preview and toasts`.

---

### Task 6: Focus, scene legend, event toasts and camera fly-to

**Files:**
- Create: `src/ui/SceneLegend.tsx`, `src/render/CameraDirector.tsx`.
- Modify: `src/ui/GameShell.tsx`, `src/render/Crowd.tsx`, `src/render/Landmarks.tsx`, `src/render/CityCanvas.tsx`, `src/render/effects/Effects.tsx` (or a small hook that shares the frame diff).

- **Focus state** in `GameShell`: `focus: { kind: "scene"; id: number } | { kind: "venue"; slot: number } | null`.
  - **Selecting a venue** sets venue focus.
  - **The legend's hover** sets a transient scene focus; **click** pins it.
  - **Esc or clicking the ground** clears it.
- **Crowd under focus:**
  - Members, meaning agents whose `frame.scene` equals the focused scene, or whose `frame.attendance` equals the focused venue slot, keep full colour and get 1.3× size.
  - Everyone else is drawn at about 12% brightness.
  - Apply this in `useFrame` through a ref fed from the prop.
- **Landmarks under focus:** venues whose `dominantScene` matches the focused scene (or the focused venue itself) stay bright; the others dim to about 30%.
- **`SceneLegend`:** a right-side panel listing the living scenes from `digest.scenes`, largest first, max 8. Each row shows:
  - a colour swatch (`sceneRgb` from the latest frame's hues);
  - a placeholder name until 5b-2's Latin names (e.g. "Scene 12", plus the top 2 entity names);
  - its size.

  Hover focuses a scene; click pins it and flies to the scene's centroid. A "Clear focus" control is visible while focused.
- **Big-moment toasts:**
  - Feed the same `FrameChange`s the effects director gets (venue opened or closed, event started, scene born or ended) into `notify`, with a world anchor.
  - Throttle to at most 1 toast per 1.5 s; drop the excess but keep the newest.
  - Auto-opened venues say "{name} opened (demand from Scene N)".
  - Clicking a toast flies the camera to its anchor.
- **`CameraDirector`:** inside the Canvas, reads a `flyTo` ref `{ x, z, at }`.
  - Over about 900 ms it eases the MapControls `target` to (x, 0, z), and moves the camera by the same delta so the viewing angle and distance are kept.
  - Get the controls via `useThree((s) => s.controls)`; `MapControls` is `makeDefault`.
  - It cancels if the user starts dragging.
- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test` and `pnpm build`.
- [ ] **Step 3:** Commit: `feat(ui): focus a scene or venue, scene legend, event toasts and fly-to camera`.

---

### Task 7: Browser check and docs (controller, with the user)

- [ ] **Browser checks**, using the preview:
  - Routes follow streets.
  - No black venues.
  - The smaller city frames well.
  - Placement is clear.
  - Focus and the legend work.
  - Toasts fly the camera.
  - No console errors.
  - Ask the user to judge the feel; the pane may be hidden for the controller.
- [ ] **Docs:** update `docs/architecture.md`, `docs/current-state.md` and the roadmap. Commit: `docs: record Plan 5b-1b completion`.
