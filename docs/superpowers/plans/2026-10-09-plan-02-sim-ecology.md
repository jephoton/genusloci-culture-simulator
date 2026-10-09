# Plan 2: Simulation Ecology — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the Plan 1 tick loop into a living, controllable ecology. This plan adds:
- **World-changing actions:** close or open a venue, schedule an event, migrate a population, apply rent pressure.
- **Scene tracking:** scenes are detected and tracked as lineages (birth, split, merge, extinction).
- **Auto-opening:** venues open by themselves into empty niches.
- **Calibration:** a fidelity score against Qloo heatmaps.
- **Timeline:** snapshots, rewind and fork.
- **Worker host:** a Web Worker host and client the UI will talk to.

**Architecture:**
- **State refactor:** venue tables move from the shared `CompiledWorld` into `SimState`, with reserve slots, and agents get an `alive` mask with reserve slots. Actions can then add venues and agents (decision 0004).
- **Actions:** zod-validated and applied at the start of a tick with the tick's RNG. Successful ones are appended to `s.log`, so any tick can be rebuilt from a snapshot plus the log.
- **Scenes:**
  - Every `sceneEvery` ticks, spherical k-means runs, warm-started from the previous centroids. Agents poorly matched to every scene can found a new one.
  - Lineages are matched by member overlap.
  - Niches score each scene's size against the capacity of venues matching its taste. The most underserved scene can trigger an auto-opened venue at a real place entity.
- **Determinism:** everything stays deterministic and inside the `SimState` object graph, with no network and no DOM.

**Tech Stack:** TypeScript, Vitest, zod (as in Plan 1).

**Spec:** [../specs/2026-10-09-genusloci-design.md](../specs/2026-10-09-genusloci-design.md), sections 5, 7 and 8. The roadmap is [2026-10-09-roadmap.md](2026-10-09-roadmap.md). Inputs from the Plan 1 final review are in `docs/current-state.md` under "Carry into Plan 2".

**Rules:**
- Atomic commits in Conventional Commits format; end each message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- No Qloo data in the repo.
- Run `pnpm test` and `pnpm exec tsc --noEmit` before each commit.

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `src/sim/actions/schema.ts` | `Action` zod schema, `ActionLogEntry`, `ActionResult`, `parseAction` | new |
| `src/sim/actions/apply.ts` | `validateAction`, `applyAction` (all five world actions) | new |
| `src/sim/scenes/types.ts` | `Lineage`, `SceneEvent`, `SceneState`, create/clone | new |
| `src/sim/scenes/cluster.ts` | Spherical k-means over genomes (`clusterAgents`) | new |
| `src/sim/scenes/lineage.ts` | Lineage matching (`updateLineages`) | new |
| `src/sim/venue-table.ts` | `addVenue`, `buildNearbyVenues`, `activeEvents` | new |
| `src/sim/niches.ts` | `findNiches`, `autoOpenVenue` | new |
| `src/sim/calibration.ts` | `ranks`, `spearman`, `computeFidelity` | new |
| `src/sim/digest.ts` | Compact `SimDigest` for UI and co-pilot | new |
| `src/sim/timeline.ts` | `Timeline`: queue, advance, snapshots, rewind, fork | new |
| `src/sim/worker/protocol.ts` | Worker request/response types | new |
| `src/sim/worker/host.ts` | `SimHost`: message handler over timelines | new |
| `src/sim/worker/sim.worker.ts` | Web Worker entry | new |
| `src/sim/worker/client.ts` | `SimClient`: promise API over a worker | new |
| `scripts/calibrate.ts` | Prints fidelity and ecology stats over a run | new |
| `src/sim/world-index.ts` | Taste graph + geography only; `writeVenueProfile`; `places` | modify |
| `src/sim/config.ts` | New ecology settings | modify |
| `src/sim/state.ts` | Agent/venue slots, scenes, log; reusable init helpers; generic clone | modify |
| `src/sim/genome.ts` | `venueAffinity` takes a profile row | modify |
| `src/sim/steps/*.ts` | Use the state venue table and alive mask; events and rent | modify |
| `src/sim/hash.ts` | Hash every typed array, plus scenes and log | modify |
| `src/sim/step.ts` | Actions, scenes, auto-open | modify |
| `docs/decisions/0004-sim-state-layout.md` | Decision record | new |

---

### Task 1: Action schema

**Files:** create `src/sim/actions/schema.ts`; test `src/sim/actions/schema.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/actions/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseAction } from "@/sim/actions/schema";

describe("parseAction", () => {
  it("accepts every action type", () => {
    const valid = [
      { type: "closeVenue", venue: 3 },
      { type: "openVenue", entity: 5, cell: 2 },
      { type: "openVenue", entity: 5, cell: 2, capacity: 80 },
      { type: "scheduleEvent", entity: 7, cell: 1, duration: 2, reachKm: 10, capacity: 5000 },
      { type: "migrate", count: 100, cells: [0, 1], genes: [{ entity: 4, weight: 0.8 }] },
      { type: "rentPressure", cells: [3], magnitude: 0.5 },
    ];
    for (const a of valid) expect(parseAction(a)).toEqual(a);
  });

  it("rejects malformed actions", () => {
    const invalid = [
      { type: "explode" },
      { type: "closeVenue", venue: -1 },
      { type: "closeVenue", venue: 1.5 },
      { type: "scheduleEvent", entity: 7, cell: 1, duration: 0, reachKm: 10, capacity: 5000 },
      { type: "migrate", count: 10, cells: [0], genes: [] },
      { type: "migrate", count: 10, cells: [], genes: [{ entity: 1, weight: 1 }] },
      { type: "rentPressure", cells: [3], magnitude: 0 },
    ];
    for (const a of invalid) expect(() => parseAction(a), JSON.stringify(a)).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/actions/schema.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/actions/schema.ts`:
```ts
import { z } from "zod";

const index = z.number().int().nonnegative();

/** World-changing commands, shared by the god toolbar and the co-pilot. Indices refer to the current World/state. */
export const ActionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("closeVenue"), venue: index }),
  z.object({
    type: z.literal("openVenue"),
    entity: index,
    cell: index,
    capacity: z.number().positive().optional(),
  }),
  z.object({
    type: z.literal("scheduleEvent"),
    entity: index,
    cell: index,
    /** Ticks (weeks) the event stays open. */
    duration: z.number().int().min(1).max(52),
    /** Agents whose home is within this distance treat the event as a candidate. */
    reachKm: z.number().positive().max(100),
    capacity: z.number().positive(),
  }),
  z.object({
    type: z.literal("migrate"),
    count: z.number().int().min(1).max(5000),
    cells: z.array(index).min(1),
    /** Taste profile of the arriving population, in this world's entity indices. */
    genes: z.array(z.object({ entity: index, weight: z.number().min(0).max(1) })).min(1),
  }),
  z.object({
    type: z.literal("rentPressure"),
    cells: z.array(index).min(1),
    /** Rent multiplier increase: rent ← rent × (1 + magnitude). */
    magnitude: z.number().positive().max(4),
  }),
]);

export type Action = z.infer<typeof ActionSchema>;
export type ActionLogEntry = { tick: number; action: Action };
export type ActionResult =
  | { ok: true; venue?: number; agents?: number }
  | { ok: false; error: string };

export function parseAction(json: unknown): Action {
  return ActionSchema.parse(json);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/actions/schema.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/actions
git commit -m "feat(sim): add action schema for world-changing commands"
```

---

### Task 2: Scene state types

**Files:** create `src/sim/scenes/types.ts`; test `src/sim/scenes/types.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/scenes/types.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { cloneSceneState, createSceneState } from "@/sim/scenes/types";

describe("scene state", () => {
  it("starts empty with every agent unassigned", () => {
    const sc = createSceneState(4);
    expect(sc.lineages).toEqual([]);
    expect(sc.live).toEqual([]);
    expect(Array.from(sc.assignment)).toEqual([-1, -1, -1, -1]);
  });

  it("clones deeply", () => {
    const sc = createSceneState(2);
    sc.lineages.push({
      id: 0, parent: null, bornTick: 0, diedTick: null, mergedInto: null, size: 2, peakSize: 2, topEntities: [1, 2],
    });
    sc.live.push(0);
    sc.centroids.push(Float32Array.from([1, 0]));
    const c = cloneSceneState(sc);
    c.lineages[0].topEntities.push(9);
    c.lineages[0].size = 99;
    c.live.push(5);
    c.centroids[0][0] = 0;
    c.assignment[0] = 3;
    expect(sc.lineages[0].topEntities).toEqual([1, 2]);
    expect(sc.lineages[0].size).toBe(2);
    expect(sc.live).toEqual([0]);
    expect(sc.centroids[0][0]).toBe(1);
    expect(sc.assignment[0]).toBe(-1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/scenes/types.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/scenes/types.ts`:
```ts
/** A scene's life story. lineages[id].id === id. */
export type Lineage = {
  id: number;
  /** The lineage this one split from, or null if born fresh. */
  parent: number | null;
  bornTick: number;
  diedTick: number | null;
  /** Set when the lineage died by merging into another. */
  mergedInto: number | null;
  size: number;
  peakSize: number;
  /** Strongest entities of the scene's centroid, strongest first. */
  topEntities: number[];
};

export type SceneEventKind = "birth" | "split" | "merge" | "extinction";

/** birth: other = null. split: other = parent. merge: `scene` merged into `other`. extinction: other = null. */
export type SceneEvent = { tick: number; kind: SceneEventKind; scene: number; other: number | null };

export type SceneState = {
  /** Every lineage ever, living or dead. */
  lineages: Lineage[];
  events: SceneEvent[];
  /** Lineage ids of the living scenes, parallel to `centroids`. */
  live: number[];
  /** Unit-length dense centroids over entities. */
  centroids: Float32Array[];
  /** Per agent slot: index into `live`, or -1. */
  assignment: Int32Array;
};

export function createSceneState(agentSlots: number): SceneState {
  return { lineages: [], events: [], live: [], centroids: [], assignment: new Int32Array(agentSlots).fill(-1) };
}

export function cloneSceneState(sc: SceneState): SceneState {
  return {
    lineages: sc.lineages.map((l) => ({ ...l, topEntities: [...l.topEntities] })),
    events: [...sc.events],
    live: [...sc.live],
    centroids: sc.centroids.map((c) => c.slice()),
    assignment: sc.assignment.slice(),
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/scenes/types.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/scenes
git commit -m "feat(sim): add scene lineage state types"
```

---

### Task 3: Move the venue table into the state; add agent slots

This is a refactor. Behaviour stays the same for existing scenarios; tests are updated to the new API. Venue tables, events, rent and the alive mask are added in one go because every step reads them.

**Files:**
- Create: `src/sim/venue-table.ts`, `src/sim/venue-table.test.ts`, `docs/decisions/0004-sim-state-layout.md`
- Replace: `src/sim/world-index.ts`, `src/sim/config.ts`, `src/sim/state.ts`, `src/sim/steps/outing.ts`, `src/sim/steps/attendance.ts`, `src/sim/steps/exposure.ts`, `src/sim/steps/drift.ts`, `src/sim/steps/decay.ts`, `src/sim/steps/venues.ts`, `src/sim/hash.ts`, `src/sim/step.ts`
- Modify: `src/sim/genome.ts` (`venueAffinity`), `scripts/bench-sim.ts`
- Update tests: `src/sim/world-index.test.ts`, `src/sim/genome.test.ts`, `src/sim/state.test.ts`, `src/sim/steps/outing.test.ts`, `src/sim/steps/exposure.test.ts`, `src/sim/steps/venues.test.ts`, `src/sim/step.test.ts`

- [ ] **Step 1: Replace `src/sim/world-index.ts`**

```ts
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
```

- [ ] **Step 2: Replace `src/sim/config.ts`**

```ts
export type SimConfig = {
  nAgents: number;
  friendsPerAgent: number;
  /** Genes sampled from the archetype at birth. */
  initialGenes: number;
  /** P(go out this tick) = outingRate × agent energy. */
  outingRate: number;
  /** Softmax sharpness for venue choice. */
  beta: number;
  distPenaltyPerKm: number;
  /** Score bonus × fraction of friends at the venue last tick. */
  friendBonus: number;
  /** Weight added to genes shared with the attended venue (scaled by profile). */
  reinforce: number;
  /** P(adopt) = adoptBase × (affinity + socialWeight × friend share). */
  adoptBase: number;
  socialWeight: number;
  initialAdoptWeight: number;
  /** P(drift) = driftRate × curiosity. */
  driftRate: number;
  decayRate: number;
  minWeight: number;
  /** EMA factor for venue health. */
  healthAlpha: number;
  closeThreshold: number;
  closeAfterTicks: number;
  /** No closures before this tick. */
  graceTicks: number;
  maxNearby: number;
  /** Spare venue slots for openVenue, scheduleEvent and auto-opening. */
  venueReserve: number;
  /** Spare agent slots for migration. */
  agentReserve: number;
  maxEvents: number;
  /** Run scene clustering (and auto-opening) every N ticks. */
  sceneEvery: number;
  maxScenes: number;
  minSceneSize: number;
  /** A sampled agent whose best cosine to every scene is below this founds a new scene. */
  newSceneThreshold: number;
  /** Agents sampled per clustering run when looking for new scenes. */
  sceneSample: number;
  kmeansIters: number;
  /** A new cluster continues or splits from a lineage only if at least this share of it came from that lineage. */
  splitShare: number;
  /** A dying lineage counts as merged if at least this share of its members went to one cluster. */
  mergeShare: number;
  autoOpen: boolean;
  /** Niche score (scene size ÷ (1 + matching venue capacity)) needed to auto-open a venue. */
  autoOpenScore: number;
};

export const DEFAULT_CONFIG: SimConfig = {
  nAgents: 5000,
  friendsPerAgent: 10,
  initialGenes: 16,
  outingRate: 0.6,
  beta: 4,
  distPenaltyPerKm: 0.3,
  friendBonus: 1.5,
  reinforce: 0.05,
  adoptBase: 0.3,
  socialWeight: 0.5,
  initialAdoptWeight: 0.15,
  driftRate: 0.05,
  decayRate: 0.02,
  minWeight: 0.02,
  healthAlpha: 0.2,
  closeThreshold: 0.1,
  closeAfterTicks: 4,
  graceTicks: 4,
  maxNearby: 12,
  venueReserve: 64,
  agentReserve: 1000,
  maxEvents: 8,
  sceneEvery: 4,
  maxScenes: 12,
  minSceneSize: 25,
  newSceneThreshold: 0.2,
  sceneSample: 400,
  kmeansIters: 3,
  splitShare: 0.3,
  mergeShare: 0.3,
  autoOpen: true,
  autoOpenScore: 2,
};
```

- [ ] **Step 3: Change `venueAffinity` in `src/sim/genome.ts` to take a profile row**

Replace the whole existing `venueAffinity` function with:
```ts
/** Weighted mean of a venue profile row (profile[offset + entity]) over the genome, in [0, 1]. */
export function venueAffinity(g: Genomes, agent: number, profile: Float32Array, offset: number): number {
  const base = agent * GENOME_CAP;
  let num = 0;
  let den = 0;
  for (let k = 0; k < GENOME_CAP; k++) {
    const id = g.ids[base + k];
    if (id === -1) continue;
    const w = g.w[base + k];
    den += w;
    num += w * profile[offset + id];
  }
  return den > 0 ? num / den : 0;
}
```

- [ ] **Step 4: Create `src/sim/venue-table.ts`**

```ts
import type { SimState } from "@/sim/state";
import { distKm, writeVenueProfile } from "@/sim/world-index";

/** Adds a venue in the next free slot and returns the slot, or -1 if the table is full. */
export function addVenue(
  s: SimState,
  entity: number,
  cell: number,
  capacity: number,
  expires = -1,
  reachKm = 0,
): number {
  const v = s.nVenues;
  if (v >= s.venueEntity.length) return -1;
  s.venueEntity[v] = entity;
  s.venueCell[v] = cell;
  s.venueCapacity[v] = capacity;
  writeVenueProfile(s.cw, entity, s.venueProfile, v * s.cw.nEntities);
  s.venueOpen[v] = 1;
  s.venueHealth[v] = 0.5;
  s.venueLowTicks[v] = 0;
  s.venueAttendance[v] = 0;
  s.venueExpires[v] = expires;
  s.venueReach[v] = reachKm;
  s.nVenues = v + 1;
  return v;
}

/** Open event venues, by slot. */
export function activeEvents(s: SimState): number[] {
  const out: number[] = [];
  for (let v = 0; v < s.nVenues; v++) if (s.venueOpen[v] && s.venueExpires[v] >= 0) out.push(v);
  return out;
}

/** Per cell: open permanent venues sorted by distance (ties by slot), at most maxNearby. */
export function buildNearbyVenues(s: SimState): Int32Array[] {
  const slots: number[] = [];
  for (let v = 0; v < s.nVenues; v++) if (s.venueOpen[v] && s.venueExpires[v] < 0) slots.push(v);
  return Array.from({ length: s.cw.nCells }, (_, c) => {
    const d = new Map(slots.map((v) => [v, distKm(s.cw, c, s.venueCell[v])]));
    const order = [...slots].sort((a, b) => (d.get(a) as number) - (d.get(b) as number) || a - b);
    return Int32Array.from(order.slice(0, s.config.maxNearby));
  });
}
```

- [ ] **Step 5: Replace `src/sim/state.ts`**

```ts
import type { ActionLogEntry } from "@/sim/actions/schema";
import { DEFAULT_CONFIG, type SimConfig } from "@/sim/config";
import { addGene, cloneGenomes, createGenomes, type Genomes, genomeSimilarity } from "@/sim/genome";
import { createRng, type Rng } from "@/sim/rng";
import { cloneSceneState, createSceneState, type SceneState } from "@/sim/scenes/types";
import { addVenue, buildNearbyVenues } from "@/sim/venue-table";
import { type CompiledWorld, compileWorld, DEFAULT_VENUE_CAPACITY } from "@/sim/world-index";
import type { World } from "@/world/schema";

const FRIEND_CANDIDATES = 24;
const SAME_CELL_FRIEND_P = 0.7;

export type SimState = {
  tick: number;
  rngState: number;
  config: SimConfig;
  /** Shared and immutable; never cloned. */
  cw: CompiledWorld;

  // Agents: slots [0, alive.length); only slots with alive[i] === 1 take part.
  alive: Uint8Array;
  homeCell: Int32Array;
  energy: Float32Array;
  curiosity: Float32Array;
  /** slots × friendsPerAgent; -1 = empty. */
  friends: Int32Array;
  genomes: Genomes;
  /** Venue slot attended in the last tick, or -1. */
  attendance: Int32Array;

  // Venues: slots [0, nVenues) are in use; the table holds venueEntity.length slots.
  nVenues: number;
  venueEntity: Int32Array;
  venueCell: Int32Array;
  venueCapacity: Float32Array;
  /** slots × nEntities: 1 for the venue's entity, else edge weight entity→e. */
  venueProfile: Float32Array;
  venueOpen: Uint8Array;
  venueHealth: Float32Array;
  venueLowTicks: Int32Array;
  /** Visitors per venue in the last tick. */
  venueAttendance: Int32Array;
  /** Tick at which an event venue ends; -1 for permanent venues. */
  venueExpires: Int32Array;
  /** Event reach in km; 0 for permanent venues. */
  venueReach: Float32Array;
  /** Per cell: nearest open permanent venues. Rows are replaced, never mutated in place. */
  nearbyVenues: Int32Array[];
  /** Per cell rent multiplier (≥ 1): venues there need proportionally more visitors. */
  cellRent: Float32Array;

  scenes: SceneState;
  /** Successfully applied actions, in order. */
  log: ActionLogEntry[];
};

/** Index of a weighted random choice, or -1 if all weights are 0. */
export function pickWeighted(weights: ArrayLike<number>, rng: Rng): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return -1;
  let r = rng.next() * total;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    last = i;
    r -= weights[i];
    if (r < 0) return i;
  }
  return last;
}

/** Largest-remainder allocation of n agents to cells by density (deterministic). */
export function allocateAgentsToCells(densities: number[], n: number): Int32Array {
  const total = densities.reduce((a, b) => a + b, 0);
  const shares = total > 0 ? densities.map((d) => (d / total) * n) : densities.map(() => n / densities.length);
  const counts = shares.map(Math.floor);
  let remaining = n - counts.reduce((a, b) => a + b, 0);
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remaining > 0; k++, remaining--) counts[order[k % order.length].i]++;
  const out = new Int32Array(n);
  let a = 0;
  counts.forEach((c, cell) => {
    for (let j = 0; j < c; j++) out[a++] = cell;
  });
  return out;
}

/** Samples up to `count` distinct genes from a weighted profile into the agent's genome. */
export function seedGenome(
  g: Genomes,
  agent: number,
  genes: { entity: number; weight: number }[],
  count: number,
  rng: Rng,
): void {
  const ws = genes.map((x) => x.weight);
  for (let n = 0; n < count; n++) {
    const k = pickWeighted(ws, rng);
    if (k === -1) break;
    addGene(g, agent, genes[k].entity, genes[k].weight * (0.5 + 0.5 * rng.next()));
    ws[k] = 0;
  }
}

/** Alive agents grouped by home cell, in slot order. */
export function agentsByCell(s: Pick<SimState, "alive" | "homeCell">, nCells: number): number[][] {
  const byCell: number[][] = Array.from({ length: nCells }, () => []);
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i]) byCell[s.homeCell[i]].push(i);
  return byCell;
}

/** Fills agent i's friend row with the most taste-similar of a random sample of (mostly same-cell) agents. */
export function chooseFriends(
  s: Pick<SimState, "homeCell" | "genomes" | "friends" | "config">,
  i: number,
  byCell: number[][],
  rng: Rng,
): void {
  const F = s.config.friendsPerAgent;
  const nCells = byCell.length;
  const seen = new Set<number>();
  const scored: { c: number; sim: number }[] = [];
  for (let k = 0; k < FRIEND_CANDIDATES; k++) {
    const cell = rng.next() < SAME_CELL_FRIEND_P ? s.homeCell[i] : rng.int(nCells);
    const list = byCell[cell];
    if (list.length === 0) continue;
    const c = list[rng.int(list.length)];
    if (c === i || seen.has(c)) continue;
    seen.add(c);
    scored.push({ c, sim: genomeSimilarity(s.genomes, i, c) });
  }
  scored.sort((a, b) => b.sim - a.sim || a.c - b.c);
  s.friends.fill(-1, i * F, (i + 1) * F);
  scored.slice(0, F).forEach((x, k) => {
    s.friends[i * F + k] = x.c;
  });
}

export function initState(world: World, config: SimConfig = DEFAULT_CONFIG, seed = 1): SimState {
  const cw = compileWorld(world);
  const rng = createRng(seed);
  const n = config.nAgents;
  const slots = n + config.agentReserve;

  const alive = new Uint8Array(slots);
  alive.fill(1, 0, n);
  const homeCell = new Int32Array(slots);
  homeCell.set(allocateAgentsToCells(world.cells.map((c) => c.density), n));
  const genomes = createGenomes(slots);
  const energy = new Float32Array(slots);
  const curiosity = new Float32Array(slots);

  for (let i = 0; i < n; i++) {
    const cell = world.cells[homeCell[i]];
    const k = pickWeighted(cell.archetypes.map((a) => a.weight), rng);
    const archetype = k === -1 ? rng.int(world.archetypes.length) : cell.archetypes[k].archetype;
    seedGenome(genomes, i, world.archetypes[archetype].genes, config.initialGenes, rng);
    energy[i] = 0.5 + 0.5 * rng.next();
    curiosity[i] = rng.next();
  }

  const initialVenues = world.entities.flatMap((e, i) => (e.type === "place" && e.cell !== undefined ? [i] : []));
  const vSlots = initialVenues.length + config.venueReserve;

  const s: SimState = {
    tick: 0,
    rngState: 0,
    config,
    cw,
    alive,
    homeCell,
    energy,
    curiosity,
    friends: new Int32Array(slots * config.friendsPerAgent).fill(-1),
    genomes,
    attendance: new Int32Array(slots).fill(-1),
    nVenues: 0,
    venueEntity: new Int32Array(vSlots),
    venueCell: new Int32Array(vSlots),
    venueCapacity: new Float32Array(vSlots),
    venueProfile: new Float32Array(vSlots * cw.nEntities),
    venueOpen: new Uint8Array(vSlots),
    venueHealth: new Float32Array(vSlots),
    venueLowTicks: new Int32Array(vSlots),
    venueAttendance: new Int32Array(vSlots),
    venueExpires: new Int32Array(vSlots).fill(-1),
    venueReach: new Float32Array(vSlots),
    nearbyVenues: [],
    cellRent: new Float32Array(cw.nCells).fill(1),
    scenes: createSceneState(slots),
    log: [],
  };

  const byCell = agentsByCell(s, cw.nCells);
  for (let i = 0; i < n; i++) chooseFriends(s, i, byCell, rng);
  for (const e of initialVenues) {
    addVenue(s, e, world.entities[e].cell as number, world.entities[e].capacity ?? DEFAULT_VENUE_CAPACITY);
  }
  s.nearbyVenues = buildNearbyVenues(s);
  s.rngState = rng.state();
  return s;
}

/**
 * Deep copy of all mutable state. Every typed-array field is copied generically, so new fields are
 * safe by default. The compiled world is shared; nearbyVenues rows are shared because they are
 * only ever replaced, never mutated.
 */
export function cloneState(s: SimState): SimState {
  const out = { ...s };
  const src = s as unknown as Record<string, unknown>;
  const dst = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    const value = src[key];
    if (ArrayBuffer.isView(value)) dst[key] = (value as Uint8Array).slice();
  }
  out.config = { ...s.config };
  out.genomes = cloneGenomes(s.genomes);
  out.nearbyVenues = [...s.nearbyVenues];
  out.scenes = cloneSceneState(s.scenes);
  out.log = [...s.log];
  return out;
}
```

- [ ] **Step 6: Replace `src/sim/steps/outing.ts`**

```ts
import { venueAffinity } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";
import { activeEvents } from "@/sim/venue-table";
import { distKm } from "@/sim/world-index";

/**
 * Each alive agent may go out and picks a venue by softmax over taste affinity, distance and friends.
 * Candidates are: open nearby venues, venues friends attended last tick, and active events within reach
 * (events carry no distance penalty: people travel for them).
 * Writes the new s.attendance (friend lookups use the previous tick's attendance).
 */
export function chooseOutings(s: SimState, rng: Rng): void {
  const { cw, config, genomes } = s;
  const n = s.alive.length;
  const F = config.friendsPerAgent;
  const nE = cw.nEntities;
  const prev = s.attendance;
  const next = new Int32Array(n).fill(-1);
  const cand = new Int32Array(config.maxNearby + F + config.maxEvents);
  const scores = new Float64Array(cand.length);
  const events = activeEvents(s);
  let m = 0;
  const push = (v: number) => {
    for (let j = 0; j < m; j++) if (cand[j] === v) return;
    cand[m++] = v;
  };

  for (let i = 0; i < n; i++) {
    if (!s.alive[i]) continue;
    if (rng.next() >= config.outingRate * s.energy[i]) continue;
    const home = s.homeCell[i];

    m = 0;
    for (const v of s.nearbyVenues[home]) if (s.venueOpen[v]) push(v);
    for (let f = 0; f < F; f++) {
      const friend = s.friends[i * F + f];
      if (friend < 0) continue;
      const fv = prev[friend];
      if (fv >= 0 && s.venueOpen[fv]) push(fv);
    }
    for (const v of events) if (distKm(cw, home, s.venueCell[v]) <= s.venueReach[v]) push(v);
    if (m === 0) continue;

    let total = 0;
    for (let j = 0; j < m; j++) {
      const v = cand[j];
      let friendsThere = 0;
      for (let f = 0; f < F; f++) {
        const friend = s.friends[i * F + f];
        if (friend >= 0 && prev[friend] === v) friendsThere++;
      }
      const distance = s.venueExpires[v] >= 0 ? 0 : distKm(cw, home, s.venueCell[v]);
      const score = Math.exp(
        config.beta * venueAffinity(genomes, i, s.venueProfile, v * nE) -
          config.distPenaltyPerKm * distance +
          config.friendBonus * (F > 0 ? friendsThere / F : 0),
      );
      scores[j] = score;
      total += score;
    }

    let r = rng.next() * total;
    let pick = cand[m - 1];
    for (let j = 0; j < m; j++) {
      r -= scores[j];
      if (r < 0) {
        pick = cand[j];
        break;
      }
    }
    next[i] = pick;
  }
  s.attendance = next;
}
```

- [ ] **Step 7: Replace `src/sim/steps/attendance.ts`**

```ts
import type { SimState } from "@/sim/state";

/** Attendees grouped by venue: venue v's agents are members[offsets[v]..offsets[v+1]). */
export type Roster = { offsets: Int32Array; members: Int32Array };

/** Sets s.venueAttendance from s.attendance and returns the attendee roster. */
export function tallyAttendance(s: SimState): Roster {
  const nV = s.nVenues;
  const counts = s.venueAttendance;
  counts.fill(0);
  for (const v of s.attendance) if (v >= 0) counts[v]++;
  const offsets = new Int32Array(nV + 1);
  for (let v = 0; v < nV; v++) offsets[v + 1] = offsets[v] + counts[v];
  const cursor = offsets.slice(0, nV);
  const members = new Int32Array(offsets[nV]);
  s.attendance.forEach((v, i) => {
    if (v >= 0) members[cursor[v]++] = i;
  });
  return { offsets, members };
}
```

- [ ] **Step 8: Replace `src/sim/steps/exposure.ts`** (the same behaviour as before, but reading the state's venue table)

```ts
import { GENOME_CAP, addGene, affinityToEntity, geneSlot, topGene } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";
import type { Roster } from "@/sim/steps/attendance";

/** P(agent adopts entity) = adoptBase × (taste-graph affinity + socialWeight × share of friends holding it). */
export function adoptionProbability(s: SimState, agent: number, entity: number): number {
  const { config, cw, genomes } = s;
  const F = config.friendsPerAgent;
  let have = 0;
  let total = 0;
  for (let f = 0; f < F; f++) {
    const friend = s.friends[agent * F + f];
    if (friend < 0) continue;
    total++;
    if (geneSlot(genomes, friend, entity) >= 0) have++;
  }
  const social = total > 0 ? have / total : 0;
  const affinity = affinityToEntity(genomes, agent, cw, entity);
  return Math.min(1, config.adoptBase * (affinity + config.socialWeight * social));
}

function tryAdopt(s: SimState, agent: number, entity: number, rng: Rng): void {
  if (geneSlot(s.genomes, agent, entity) >= 0) return;
  if (rng.next() < adoptionProbability(s, agent, entity)) {
    addGene(s.genomes, agent, entity, s.config.initialAdoptWeight);
  }
}

/**
 * For each attendee: reinforce genes the venue's profile shares, then try to adopt
 * (1) the venue's entity and (2) a random co-attendee's strongest gene.
 */
export function applyExposure(s: SimState, rng: Rng, roster: Roster): void {
  const { config, genomes } = s;
  const nE = s.cw.nEntities;
  for (let i = 0; i < s.attendance.length; i++) {
    const v = s.attendance[i];
    if (v < 0) continue;

    const base = i * GENOME_CAP;
    const row = v * nE;
    for (let k = 0; k < GENOME_CAP; k++) {
      const id = genomes.ids[base + k];
      if (id < 0) continue;
      const p = s.venueProfile[row + id];
      if (p > 0) genomes.w[base + k] = Math.min(1, genomes.w[base + k] + config.reinforce * p);
    }

    tryAdopt(s, i, s.venueEntity[v], rng);

    const size = roster.offsets[v + 1] - roster.offsets[v];
    if (size > 1) {
      const other = roster.members[roster.offsets[v] + rng.int(size)];
      if (other !== i) {
        const e = topGene(genomes, other);
        if (e >= 0) tryAdopt(s, i, e, rng);
      }
    }
  }
}
```

- [ ] **Step 9: Replace `src/sim/steps/drift.ts` and `src/sim/steps/decay.ts`** (now skipping dead slots)

`src/sim/steps/drift.ts`:
```ts
import { GENOME_CAP, addGene } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";

/**
 * Mutation: with P = driftRate × curiosity, pick a gene (weighted by strength), then a neighbour
 * of it on the taste graph (weighted by edge affinity), and add it at half the adoption weight.
 * Drift only ever follows real affinity edges.
 */
export function applyDrift(s: SimState, rng: Rng): void {
  const { cw, config, genomes } = s;
  for (let i = 0; i < s.alive.length; i++) {
    if (!s.alive[i]) continue;
    if (rng.next() >= config.driftRate * s.curiosity[i]) continue;
    const base = i * GENOME_CAP;

    let total = 0;
    for (let k = 0; k < GENOME_CAP; k++) if (genomes.ids[base + k] >= 0) total += genomes.w[base + k];
    if (total <= 0) continue;
    let r = rng.next() * total;
    let source = -1;
    for (let k = 0; k < GENOME_CAP; k++) {
      if (genomes.ids[base + k] < 0) continue;
      source = genomes.ids[base + k];
      r -= genomes.w[base + k];
      if (r < 0) break;
    }

    const start = cw.edgeOffsets[source];
    const end = cw.edgeOffsets[source + 1];
    if (end === start) continue;
    let edgeTotal = 0;
    for (let j = start; j < end; j++) edgeTotal += cw.edgeWeights[j];
    let re = rng.next() * edgeTotal;
    let target = cw.edgeTargets[end - 1];
    for (let j = start; j < end; j++) {
      re -= cw.edgeWeights[j];
      if (re < 0) {
        target = cw.edgeTargets[j];
        break;
      }
    }
    addGene(genomes, i, target, config.initialAdoptWeight * 0.5);
  }
}
```

`src/sim/steps/decay.ts`:
```ts
import { decayGenome } from "@/sim/genome";
import type { SimState } from "@/sim/state";

/** Unreinforced tastes fade; genes below minWeight are forgotten. */
export function applyDecay(s: SimState): void {
  const { decayRate, minWeight } = s.config;
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i]) decayGenome(s.genomes, i, decayRate, minWeight);
}
```

- [ ] **Step 10: Replace `src/sim/steps/venues.ts`**

```ts
import type { SimState } from "@/sim/state";

/**
 * Venue ecology.
 * - Permanent venues: health is an EMA of rent-adjusted occupancy, min(1, visitors / (capacity × cell rent)).
 *   After the grace period, a venue below closeThreshold for closeAfterTicks consecutive ticks closes.
 * - Events close at the end of their last tick.
 * Returns true if any venue closed (nearby lists then need rebuilding).
 */
export function updateVenues(s: SimState): boolean {
  const { healthAlpha, closeThreshold, closeAfterTicks, graceTicks } = s.config;
  let closed = false;
  for (let v = 0; v < s.nVenues; v++) {
    if (!s.venueOpen[v]) continue;
    const effectiveCapacity = s.venueCapacity[v] * s.cellRent[s.venueCell[v]];
    const occupancy = Math.min(1, s.venueAttendance[v] / effectiveCapacity);
    s.venueHealth[v] = (1 - healthAlpha) * s.venueHealth[v] + healthAlpha * occupancy;

    if (s.venueExpires[v] >= 0) {
      if (s.tick + 1 >= s.venueExpires[v]) {
        s.venueOpen[v] = 0;
        closed = true;
      }
      continue;
    }

    if (s.tick >= graceTicks && s.venueHealth[v] < closeThreshold) s.venueLowTicks[v]++;
    else s.venueLowTicks[v] = 0;
    if (s.venueLowTicks[v] >= closeAfterTicks) {
      s.venueOpen[v] = 0;
      closed = true;
    }
  }
  return closed;
}
```

- [ ] **Step 11: Replace `src/sim/hash.ts` and `src/sim/step.ts`**

`src/sim/hash.ts`:
```ts
import type { SimState } from "@/sim/state";

/** FNV-1a over all mutable state (every typed array, scenes and the action log): used to assert determinism. */
export function hashState(s: SimState): string {
  let h = 0x811c9dc5;
  const feedBytes = (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
  };
  const feed = (arr: ArrayBufferView) => feedBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));

  feed(Int32Array.from([s.tick, s.rngState | 0, s.nVenues]));
  for (const value of Object.values(s)) if (ArrayBuffer.isView(value)) feed(value);
  feed(s.genomes.ids);
  feed(s.genomes.w);
  feed(s.scenes.assignment);
  for (const c of s.scenes.centroids) feed(c);
  feedBytes(new TextEncoder().encode(JSON.stringify([s.scenes.lineages, s.scenes.events, s.scenes.live, s.log])));
  return (h >>> 0).toString(16).padStart(8, "0");
}
```

`src/sim/step.ts`:
```ts
import { createRng } from "@/sim/rng";
import type { SimState } from "@/sim/state";
import { tallyAttendance } from "@/sim/steps/attendance";
import { applyDecay } from "@/sim/steps/decay";
import { applyDrift } from "@/sim/steps/drift";
import { applyExposure } from "@/sim/steps/exposure";
import { chooseOutings } from "@/sim/steps/outing";
import { updateVenues } from "@/sim/steps/venues";
import { buildNearbyVenues } from "@/sim/venue-table";

/**
 * One tick = one simulated week. Mutates `s` in place and returns it.
 * Deterministic: randomness comes only from s.rngState. Use cloneState() for snapshots.
 */
export function step(s: SimState): SimState {
  const rng = createRng(s.rngState);
  chooseOutings(s, rng);
  const roster = tallyAttendance(s);
  applyExposure(s, rng, roster);
  applyDrift(s, rng);
  applyDecay(s);
  if (updateVenues(s)) s.nearbyVenues = buildNearbyVenues(s);
  s.tick++;
  s.rngState = rng.state();
  return s;
}
```

- [ ] **Step 12: Update the bench script.** In `scripts/bench-sim.ts`, change `venues=${s.cw.venues.length}` to `venues=${s.nVenues}`.

- [ ] **Step 13: Replace `src/sim/world-index.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { compileWorld, distKm, edgeWeight, writeVenueProfile } from "@/sim/world-index";
import type { World } from "@/world/schema";

const world = (): World => ({
  version: 1,
  city: { name: "T", lat: 0, lon: 0 },
  entities: [
    { id: "syn:a", name: "A", type: "artist", tags: [], popularity: 0.5 },
    { id: "syn:b", name: "B", type: "artist", tags: [], popularity: 0.5 },
    { id: "syn:v", name: "V", type: "place", tags: [], popularity: 0.5, cell: 1, capacity: 20 },
  ],
  edges: [
    { source: 0, target: 2, weight: 0.5 },
    { source: 0, target: 1, weight: 0.3 },
    { source: 0, target: 1, weight: 0.7 },
    { source: 2, target: 0, weight: 0.4 },
    { source: 1, target: 1, weight: 0.9 },
  ],
  cells: [
    { geohash: "a", lat: 0, lon: 0, density: 1, archetypes: [{ archetype: 0, weight: 1 }] },
    { geohash: "b", lat: 0, lon: 0.1, density: 1, archetypes: [{ archetype: 0, weight: 1 }] },
  ],
  archetypes: [{ id: "x", name: "X", genes: [{ entity: 0, weight: 1 }] }],
  heatmaps: [],
});

describe("compileWorld", () => {
  const cw = compileWorld(world());

  it("builds CSR edges, keeping the max weight of duplicates and dropping self-loops", () => {
    expect(edgeWeight(cw, 0, 1)).toBeCloseTo(0.7);
    expect(edgeWeight(cw, 0, 2)).toBeCloseTo(0.5);
    expect(edgeWeight(cw, 1, 0)).toBe(0);
    expect(edgeWeight(cw, 1, 1)).toBe(0);
  });

  it("drops zero-weight edges so drift only follows real affinity", () => {
    const w = world();
    w.edges.push({ source: 1, target: 2, weight: 0 });
    const c = compileWorld(w);
    expect(c.edgeOffsets[2] - c.edgeOffsets[1]).toBe(0);
  });

  it("lists place entities and counts cells", () => {
    expect(Array.from(cw.places)).toEqual([2]);
    expect(cw.nCells).toBe(2);
  });

  it("computes distance in km", () => {
    expect(distKm(cw, 0, 0)).toBe(0);
    expect(distKm(cw, 0, 1)).toBeCloseTo(11.1, 0);
  });
});

describe("writeVenueProfile", () => {
  it("writes 1 for the venue itself and edge weights for neighbours, only in its row", () => {
    const cw = compileWorld(world());
    const out = new Float32Array(cw.nEntities * 2).fill(9);
    writeVenueProfile(cw, 2, out, cw.nEntities);
    expect(Array.from(out.subarray(0, 3))).toEqual([9, 9, 9]);
    expect(out[3 + 2]).toBe(1);
    expect(out[3 + 0]).toBeCloseTo(0.4);
    expect(out[3 + 1]).toBe(0);
  });
});
```

- [ ] **Step 14: Create `src/sim/venue-table.test.ts`**

```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { activeEvents, addVenue, buildNearbyVenues } from "@/sim/venue-table";
import { distKm } from "@/sim/world-index";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const base = { ...DEFAULT_CONFIG, nAgents: 50, agentReserve: 0 };

describe("venue table", () => {
  it("loads the world's venues and reserves spare slots", () => {
    const s = initState(world, { ...base, venueReserve: 5 }, 1);
    expect(s.nVenues).toBe(12);
    expect(s.venueEntity).toHaveLength(17);
    expect(Array.from(s.venueEntity.subarray(0, 12)).every((e) => world.entities[e].type === "place")).toBe(true);
    expect(Array.from(s.venueExpires.subarray(0, 12)).every((x) => x === -1)).toBe(true);
  });

  it("addVenue fills the next slot and refuses when full", () => {
    const s = initState(world, { ...base, venueReserve: 1 }, 1);
    const v = addVenue(s, 5, 3, 40);
    expect(v).toBe(12);
    expect(s.venueCell[v]).toBe(3);
    expect(s.venueCapacity[v]).toBe(40);
    expect(s.venueProfile[v * s.cw.nEntities + 5]).toBe(1);
    expect(s.venueOpen[v]).toBe(1);
    expect(addVenue(s, 6, 3, 40)).toBe(-1);
  });

  it("builds nearby lists of open permanent venues sorted by distance", () => {
    const s = initState(world, base, 1);
    s.venueOpen[0] = 0;
    const ev = addVenue(s, 5, 0, 40, 10, 5);
    const nearby = buildNearbyVenues(s);
    expect(nearby).toHaveLength(world.cells.length);
    for (let c = 0; c < nearby.length; c++) {
      const row = Array.from(nearby[c]);
      expect(row).not.toContain(0);
      expect(row).not.toContain(ev);
      const d = row.map((v) => distKm(s.cw, c, s.venueCell[v]));
      expect(d).toEqual([...d].sort((a, b) => a - b));
    }
  });

  it("lists active events only", () => {
    const s = initState(world, base, 1);
    const ev = addVenue(s, 5, 0, 40, 10, 5);
    expect(activeEvents(s)).toEqual([ev]);
    s.venueOpen[ev] = 0;
    expect(activeEvents(s)).toEqual([]);
  });
});
```

- [ ] **Step 15: Update `src/sim/genome.test.ts`**

Change the import `import { compileWorld } from "@/sim/world-index";` to:
```ts
import { compileWorld, writeVenueProfile } from "@/sim/world-index";
```
Replace the test `"scores venue affinity higher for same-cluster venues"` with:
```ts
  it("scores venue affinity higher for same-cluster venues", () => {
    const g = createGenomes(1);
    addGene(g, 0, idx(0, 5), 1);
    addGene(g, 0, idx(0, 6), 1);
    const profile = new Float32Array(cw.nEntities * 2);
    writeVenueProfile(cw, idx(0, 0), profile, 0);
    writeVenueProfile(cw, idx(1, 0), profile, cw.nEntities);
    expect(venueAffinity(g, 0, profile, 0)).toBeGreaterThan(venueAffinity(g, 0, profile, cw.nEntities));
  });
```

- [ ] **Step 16: Replace the `describe("initState", …)` block of `src/sim/state.test.ts`**

Change `const config = { ...DEFAULT_CONFIG, nAgents: 300 };` to `const config = { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 100 };`, then replace the whole `describe("initState", …)` block with:
```ts
describe("initState", () => {
  const world = makeTinyWorld();
  const s = initState(world, config, 5);
  const F = config.friendsPerAgent;

  it("allocates agent slots with a reserve; only nAgents are alive", () => {
    expect(s.alive).toHaveLength(400);
    expect(Array.from(s.alive).filter((x) => x === 1)).toHaveLength(300);
    expect(Array.from(s.alive.subarray(0, 300)).every((x) => x === 1)).toBe(true);
    expect(Math.max(...s.homeCell.subarray(0, 300))).toBeLessThan(world.cells.length);
  });

  it("gives every alive agent a non-empty genome of world entities", () => {
    for (let i = 0; i < 300; i++) {
      const ids = Array.from(s.genomes.ids.subarray(i * GENOME_CAP, (i + 1) * GENOME_CAP)).filter((x) => x >= 0);
      expect(ids.length).toBeGreaterThan(0);
      expect(Math.max(...ids)).toBeLessThan(world.entities.length);
    }
  });

  it("leaves reserve slots empty", () => {
    expect(Array.from(s.genomes.ids.subarray(300 * GENOME_CAP)).every((x) => x === -1)).toBe(true);
    expect(Array.from(s.friends.subarray(300 * F)).every((x) => x === -1)).toBe(true);
  });

  it("gives friends that are other alive agents, with no duplicates", () => {
    for (let i = 0; i < 300; i++) {
      const fr = Array.from(s.friends.subarray(i * F, (i + 1) * F)).filter((x) => x >= 0);
      expect(fr).not.toContain(i);
      expect(new Set(fr).size).toBe(fr.length);
      fr.forEach((f) => expect(f).toBeLessThan(300));
    }
  });

  it("starts with all venues open, nobody out and no rent pressure", () => {
    expect(s.tick).toBe(0);
    expect(Array.from(s.venueOpen.subarray(0, s.nVenues)).every((x) => x === 1)).toBe(true);
    expect(Array.from(s.attendance).every((x) => x === -1)).toBe(true);
    expect(Array.from(s.cellRent).every((x) => x === 1)).toBe(true);
    expect(s.log).toEqual([]);
  });

  it("clones deeply: no typed array is shared except inside the compiled world", () => {
    const c = cloneState(s);
    const src = s as unknown as Record<string, unknown>;
    const dst = c as unknown as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      if (ArrayBuffer.isView(src[key])) expect(dst[key], key).not.toBe(src[key]);
    }
    expect(c.genomes.ids).not.toBe(s.genomes.ids);
    expect(c.genomes.w).not.toBe(s.genomes.w);
    expect(c.scenes.assignment).not.toBe(s.scenes.assignment);
    expect(c.log).not.toBe(s.log);
    expect(c.cw).toBe(s.cw);
    c.venueOpen[0] = 0;
    expect(s.venueOpen[0]).toBe(1);
  });
});
```

- [ ] **Step 17: Update `src/sim/steps/outing.test.ts`**

Make these replacements:
- Every `{ ...DEFAULT_CONFIG, nAgents: N, ... }` → `{ ...DEFAULT_CONFIG, nAgents: N, agentReserve: 0, ... }`, keeping the other fields.
- `expect(v).toBeLessThan(s.cw.venues.length)` → `expect(v).toBeLessThan(s.nVenues)`.
- `clusterOfEntity(s.cw.venues[v])` → `clusterOfEntity(s.venueEntity[v])`.

- [ ] **Step 18: Update `src/sim/steps/exposure.test.ts`**

Make these replacements:
- Every `{ ...DEFAULT_CONFIG, nAgents: N` → `{ ...DEFAULT_CONFIG, nAgents: N, agentReserve: 0`.
- Both occurrences of `Array.from(s.cw.venues).indexOf(idx(0, 0))` → `Array.from(s.venueEntity.subarray(0, s.nVenues)).indexOf(idx(0, 0))`.

- [ ] **Step 19: Add a return-value test to `src/sim/steps/venues.test.ts`** (inside the `describe`)

With `healthAlpha` 0.5 and no visitors, health goes 0.5 → 0.25 (call 1, not below 0.2) → 0.125 (call 2, low count 1) → 0.0625 (call 3, low count 2 = `closeAfterTicks`, so it closes):
```ts
  it("reports whether any venue closed", () => {
    const s = initState(makeTinyWorld(), config, 1);
    s.venueAttendance.fill(0);
    s.tick = 5;
    expect(updateVenues(s)).toBe(false);
    expect(updateVenues(s)).toBe(false);
    expect(updateVenues(s)).toBe(true);
  });
```

- [ ] **Step 20: Update `src/sim/step.test.ts`**

Replace `const slot = Array.from(s.cw.venues).indexOf(venueEntity);` with:
```ts
    const slot = Array.from(s.venueEntity.subarray(0, s.nVenues)).indexOf(venueEntity);
```

- [ ] **Step 21: Write the decision record** `docs/decisions/0004-sim-state-layout.md`

```markdown
# 0004 — Simulation state layout: per-state venue table and agent slots

- **Status:** Accepted (2026-10-09)
- **Decision:**
  - Venue tables (entity, cell, capacity, dense taste profile, health, expiry, reach) live in `SimState` with `venueReserve` spare slots. `nearbyVenues` is rebuilt whenever a venue opens or closes.
  - Agents occupy `nAgents + agentReserve` slots with an `alive` mask.
  - `CompiledWorld` keeps only the immutable taste graph, place list and geography.
- **Alternatives considered:**
  - Keeping venues in `CompiledWorld`: cannot open venues per timeline.
  - Growable arrays: reallocation breaks typed-array views and complicates cloning.
- **Rationale:** actions (open venue, event, migrate) and auto-opening need per-timeline venue and agent sets that clone, hash and rewind with the state. Fixed reserves keep every structure a flat typed array.
- **Consequences:** the reserves cap how many venues and migrants a timeline can add (validated by actions). Every loop over agents checks `alive`; every loop over venues runs to `nVenues`.
```

- [ ] **Step 22: Verify**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm bench:sim`.
Expected: all tests pass; tsc and lint clean; bench ≥ 10 ticks/sec.

- [ ] **Step 23: Commit**

```bash
git add -A src/sim scripts/bench-sim.ts docs/decisions/0004-sim-state-layout.md
git commit -m "refactor(sim): move venue table into state and add agent slots"
```

- [ ] **Step 24: Remove agent-order bias in exposure.** Co-attendees' strongest genes are snapshotted before anyone adopts this tick.

In `src/sim/steps/exposure.ts`, inside `applyExposure`, insert directly after `const nE = s.cw.nEntities;`:
```ts
  // Snapshot every attendee's strongest gene first, so adoption this tick doesn't depend on agent order.
  const tops = new Int32Array(s.attendance.length).fill(-1);
  for (let i = 0; i < s.attendance.length; i++) if (s.attendance[i] >= 0) tops[i] = topGene(genomes, i);
```
And replace:
```ts
        const e = topGene(genomes, other);
```
with:
```ts
        const e = tops[other];
```

Run: `pnpm test` (expect all pass), then commit:
```bash
git add src/sim/steps/exposure.ts
git commit -m "fix(sim): snapshot co-attendee genes before adoption to remove order bias"
```

---

### Task 4: Apply actions in the tick

**Files:** create `src/sim/actions/apply.ts`; test `src/sim/actions/apply.test.ts`; replace `src/sim/step.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/actions/apply.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { applyAction, MAX_RENT, validateAction } from "@/sim/actions/apply";
import { DEFAULT_CONFIG } from "@/sim/config";
import { GENOME_CAP } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { updateVenues } from "@/sim/steps/venues";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const idx = (c: number, j: number) => c * 12 + j;
const base = { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 100, autoOpen: false };
const fresh = (overrides = {}) => initState(world, { ...base, ...overrides }, 1);
const rng = () => createRng(99);

describe("closeVenue", () => {
  it("closes the venue and removes it from nearby lists", () => {
    const s = fresh();
    expect(applyAction(s, { type: "closeVenue", venue: 2 }, rng())).toEqual({ ok: true, venue: 2 });
    expect(s.venueOpen[2]).toBe(0);
    s.nearbyVenues.forEach((row) => expect(Array.from(row)).not.toContain(2));
  });

  it("rejects unknown or already-closed venues without changing anything", () => {
    const s = fresh();
    expect(applyAction(s, { type: "closeVenue", venue: 99 }, rng()).ok).toBe(false);
    applyAction(s, { type: "closeVenue", venue: 2 }, rng());
    expect(validateAction(s, { type: "closeVenue", venue: 2 })).toMatch(/already closed/);
  });
});

describe("openVenue", () => {
  it("adds a venue at the cell with the entity's profile", () => {
    const s = fresh();
    const r = applyAction(s, { type: "openVenue", entity: idx(1, 5), cell: 3, capacity: 80 }, rng());
    expect(r).toEqual({ ok: true, venue: 12 });
    expect(s.nVenues).toBe(13);
    expect(s.venueCell[12]).toBe(3);
    expect(s.venueCapacity[12]).toBe(80);
    expect(s.venueProfile[12 * s.cw.nEntities + idx(1, 5)]).toBe(1);
    expect(Array.from(s.nearbyVenues[3])).toContain(12);
  });

  it("rejects bad indices and a full venue table", () => {
    const s = fresh({ venueReserve: 0 });
    expect(validateAction(s, { type: "openVenue", entity: 999, cell: 0 })).toMatch(/entity/);
    expect(validateAction(s, { type: "openVenue", entity: 1, cell: 99 })).toMatch(/cell/);
    expect(validateAction(s, { type: "openVenue", entity: 1, cell: 0 })).toMatch(/slots/);
  });
});

describe("scheduleEvent", () => {
  const event = { type: "scheduleEvent", entity: idx(0, 5), cell: 0, duration: 2, reachKm: 50, capacity: 1e6 } as const;

  it("draws agents from across the city and expires after its duration", () => {
    const s = fresh();
    const r = step(s, [event]);
    expect(r[0].ok).toBe(true);
    const ev = 12;
    const homes = new Set<number>();
    s.attendance.forEach((v, i) => {
      if (v === ev) homes.add(s.homeCell[i]);
    });
    expect(homes.size).toBeGreaterThanOrEqual(3);
    expect(s.venueOpen[ev]).toBe(1);
    step(s);
    expect(s.venueOpen[ev]).toBe(0);
  });

  it("is limited by maxEvents", () => {
    const s = fresh({ maxEvents: 1 });
    expect(applyAction(s, event, rng()).ok).toBe(true);
    expect(validateAction(s, event)).toMatch(/events/);
  });
});

describe("migrate", () => {
  const genes = [{ entity: idx(2, 6), weight: 1 }, { entity: idx(2, 7), weight: 0.8 }];

  it("brings new agents with the given tastes and gives them friends", () => {
    const s = fresh();
    const r = applyAction(s, { type: "migrate", count: 40, cells: [5, 6], genes }, rng());
    expect(r).toEqual({ ok: true, agents: 40 });
    expect(Array.from(s.alive).filter((x) => x === 1)).toHaveLength(340);
    for (let i = 300; i < 340; i++) {
      expect([5, 6]).toContain(s.homeCell[i]);
      const ids = Array.from(s.genomes.ids.subarray(i * GENOME_CAP, (i + 1) * GENOME_CAP)).filter((x) => x >= 0);
      expect(ids.every((e) => e === idx(2, 6) || e === idx(2, 7))).toBe(true);
      expect(s.friends[i * s.config.friendsPerAgent]).toBeGreaterThanOrEqual(0);
    }
  });

  it("rejects more migrants than free slots", () => {
    const s = fresh();
    expect(validateAction(s, { type: "migrate", count: 101, cells: [0], genes })).toMatch(/free agent slots/);
  });
});

describe("rentPressure", () => {
  it("raises rent (capped) and makes venues there lose health faster", () => {
    const s = fresh();
    const a = 0;
    const b = Array.from({ length: s.nVenues }, (_, v) => v).find((v) => s.venueCell[v] !== s.venueCell[a]) as number;
    applyAction(s, { type: "rentPressure", cells: [s.venueCell[a]], magnitude: 1 }, rng());
    expect(s.cellRent[s.venueCell[a]]).toBe(2);
    s.venueAttendance.fill(0);
    s.venueAttendance[a] = 25;
    s.venueAttendance[b] = 25;
    updateVenues(s);
    expect(s.venueHealth[a]).toBeLessThan(s.venueHealth[b]);
    for (let k = 0; k < 5; k++) applyAction(s, { type: "rentPressure", cells: [s.venueCell[a]], magnitude: 4 }, rng());
    expect(s.cellRent[s.venueCell[a]]).toBe(MAX_RENT);
  });
});

describe("step with actions", () => {
  it("returns a result per action and logs only successful ones at the current tick", () => {
    const s = fresh();
    step(s);
    const results = step(s, [{ type: "closeVenue", venue: 1 }, { type: "closeVenue", venue: 99 }]);
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(s.log).toEqual([{ tick: 1, action: { type: "closeVenue", venue: 1 } }]);
  });
});
```

The rent test's expected health: both venues have capacity 50 and 25 visitors. Venue `a`'s effective capacity is 100 (occupancy 0.25), and `b`'s is 50 (occupancy 0.5). So `a`'s health becomes 0.45 and `b`'s becomes 0.5.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/actions/apply.test.ts`
Expected: FAIL. The module `@/sim/actions/apply` cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/actions/apply.ts`:
```ts
import type { Action, ActionResult } from "@/sim/actions/schema";
import { GENOME_CAP } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import { agentsByCell, chooseFriends, seedGenome, type SimState } from "@/sim/state";
import { activeEvents, addVenue, buildNearbyVenues } from "@/sim/venue-table";
import { DEFAULT_VENUE_CAPACITY } from "@/sim/world-index";

export const MAX_RENT = 5;

type MigrateAction = Extract<Action, { type: "migrate" }>;

/** Why `a` can't be applied to `s` right now, or null if it can. */
export function validateAction(s: SimState, a: Action): string | null {
  const nE = s.cw.nEntities;
  const nC = s.cw.nCells;
  const venueRoom = s.nVenues < s.venueEntity.length;
  switch (a.type) {
    case "closeVenue":
      if (a.venue >= s.nVenues) return `unknown venue ${a.venue}`;
      return s.venueOpen[a.venue] ? null : `venue ${a.venue} is already closed`;
    case "openVenue":
      if (a.entity >= nE) return `unknown entity ${a.entity}`;
      if (a.cell >= nC) return `unknown cell ${a.cell}`;
      return venueRoom ? null : "no free venue slots";
    case "scheduleEvent":
      if (a.entity >= nE) return `unknown entity ${a.entity}`;
      if (a.cell >= nC) return `unknown cell ${a.cell}`;
      if (!venueRoom) return "no free venue slots";
      return activeEvents(s).length >= s.config.maxEvents ? "too many active events" : null;
    case "migrate": {
      if (a.cells.some((c) => c >= nC)) return "unknown cell in migrate.cells";
      if (a.genes.some((g) => g.entity >= nE)) return "unknown entity in migrate.genes";
      let free = 0;
      for (const x of s.alive) if (!x) free++;
      return free >= a.count ? null : `only ${free} free agent slots`;
    }
    case "rentPressure":
      return a.cells.some((c) => c >= nC) ? "unknown cell in rentPressure.cells" : null;
  }
}

function migrate(s: SimState, a: MigrateAction, rng: Rng): number {
  const placed: number[] = [];
  for (let i = 0; i < s.alive.length && placed.length < a.count; i++) {
    if (s.alive[i]) continue;
    s.alive[i] = 1;
    s.homeCell[i] = a.cells[rng.int(a.cells.length)];
    s.genomes.ids.fill(-1, i * GENOME_CAP, (i + 1) * GENOME_CAP);
    s.genomes.w.fill(0, i * GENOME_CAP, (i + 1) * GENOME_CAP);
    seedGenome(s.genomes, i, a.genes, s.config.initialGenes, rng);
    s.energy[i] = 0.5 + 0.5 * rng.next();
    s.curiosity[i] = rng.next();
    s.attendance[i] = -1;
    placed.push(i);
  }
  const byCell = agentsByCell(s, s.cw.nCells);
  for (const i of placed) chooseFriends(s, i, byCell, rng);
  return placed.length;
}

/** Applies `a` if valid. Invalid actions change nothing and return ok: false with the reason. */
export function applyAction(s: SimState, a: Action, rng: Rng): ActionResult {
  const error = validateAction(s, a);
  if (error) return { ok: false, error };
  switch (a.type) {
    case "closeVenue":
      s.venueOpen[a.venue] = 0;
      s.nearbyVenues = buildNearbyVenues(s);
      return { ok: true, venue: a.venue };
    case "openVenue": {
      const venue = addVenue(s, a.entity, a.cell, a.capacity ?? DEFAULT_VENUE_CAPACITY);
      s.nearbyVenues = buildNearbyVenues(s);
      return { ok: true, venue };
    }
    case "scheduleEvent": {
      const venue = addVenue(s, a.entity, a.cell, a.capacity, s.tick + a.duration, a.reachKm);
      return { ok: true, venue };
    }
    case "migrate":
      return { ok: true, agents: migrate(s, a, rng) };
    case "rentPressure":
      for (const c of a.cells) s.cellRent[c] = Math.min(MAX_RENT, s.cellRent[c] * (1 + a.magnitude));
      return { ok: true };
  }
}
```

- [ ] **Step 4: Replace `src/sim/step.ts`**

```ts
import { applyAction } from "@/sim/actions/apply";
import type { Action, ActionResult } from "@/sim/actions/schema";
import { createRng } from "@/sim/rng";
import type { SimState } from "@/sim/state";
import { tallyAttendance } from "@/sim/steps/attendance";
import { applyDecay } from "@/sim/steps/decay";
import { applyDrift } from "@/sim/steps/drift";
import { applyExposure } from "@/sim/steps/exposure";
import { chooseOutings } from "@/sim/steps/outing";
import { updateVenues } from "@/sim/steps/venues";
import { buildNearbyVenues } from "@/sim/venue-table";

/**
 * One tick = one simulated week. Applies `actions` first (logging the successful ones at the current
 * tick), then runs the ecology. Mutates `s` in place and returns one result per action.
 * Deterministic: randomness comes only from s.rngState. Use cloneState() for snapshots.
 */
export function step(s: SimState, actions: readonly Action[] = []): ActionResult[] {
  const rng = createRng(s.rngState);
  const results = actions.map((action) => {
    const result = applyAction(s, action, rng);
    if (result.ok) s.log.push({ tick: s.tick, action });
    return result;
  });
  chooseOutings(s, rng);
  const roster = tallyAttendance(s);
  applyExposure(s, rng, roster);
  applyDrift(s, rng);
  applyDecay(s);
  if (updateVenues(s)) s.nearbyVenues = buildNearbyVenues(s);
  s.tick++;
  s.rngState = rng.state();
  return results;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test` (all files) and `pnpm exec tsc --noEmit`.
Expected: all pass, including the 9 new tests in `apply.test.ts`.

- [ ] **Step 6: Commit**

```bash
git add src/sim/actions/apply.ts src/sim/actions/apply.test.ts src/sim/step.ts
git commit -m "feat(sim): apply venue, event, migration and rent actions in the tick"
```

---

### Task 5: Scene clustering

**Files:** create `src/sim/scenes/cluster.ts`; test `src/sim/scenes/cluster.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/scenes/cluster.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { addGene, createGenomes, GENOME_CAP } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { agentVector, clusterAgents, simToCentroid } from "@/sim/scenes/cluster";
import { initState } from "@/sim/state";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const config = { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 50, minSceneSize: 20 };
const clusterOf = (e: number) => Math.floor(e / 12);

describe("simToCentroid / agentVector", () => {
  it("is 1 for the agent's own vector and 0 for a disjoint one", () => {
    const g = createGenomes(2);
    addGene(g, 0, 1, 0.5);
    addGene(g, 0, 2, 1);
    addGene(g, 1, 3, 1);
    expect(simToCentroid(g, 0, agentVector(g, 0, 5))).toBeCloseTo(1);
    expect(simToCentroid(g, 0, agentVector(g, 1, 5))).toBe(0);
  });
});

describe("clusterAgents", () => {
  const s = initState(world, config, 3);
  const result = clusterAgents(s, [], createRng(1));

  it("finds the three synthetic taste clusters with high purity", () => {
    expect(result.centroids.length).toBeGreaterThanOrEqual(3);
    const majority = result.centroids.map((_, c) => {
      const counts = [0, 0, 0];
      for (let i = 0; i < 600; i++) if (result.assignment[i] === c) counts[clusterOf(s.genomes.ids[i * GENOME_CAP])]++;
      const total = counts.reduce((a, b) => a + b, 0);
      return { cluster: counts.indexOf(Math.max(...counts)), purity: Math.max(...counts) / total };
    });
    expect(new Set(majority.map((m) => m.cluster)).size).toBe(3);
    majority.forEach((m) => expect(m.purity).toBeGreaterThan(0.9));
  });

  it("assigns every alive agent with genes, and no reserve slot", () => {
    for (let i = 0; i < 600; i++) expect(result.assignment[i]).toBeGreaterThanOrEqual(0);
    for (let i = 600; i < 650; i++) expect(result.assignment[i]).toBe(-1);
    expect(result.sizes.reduce((a, b) => a + b, 0)).toBe(600);
  });

  it("returns unit-length centroids", () => {
    for (const c of result.centroids) {
      let norm = 0;
      for (const x of c) norm += x * x;
      expect(norm).toBeCloseTo(1, 4);
    }
  });

  it("is deterministic and stable when warm-started from its own centroids", () => {
    const again = clusterAgents(s, [], createRng(1));
    expect(Array.from(again.assignment)).toEqual(Array.from(result.assignment));
    const warm = clusterAgents(s, result.centroids, createRng(2));
    let same = 0;
    for (let i = 0; i < 600; i++) if (warm.assignment[i] === result.assignment[i]) same++;
    expect(same / 600).toBeGreaterThan(0.95);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/scenes/cluster.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/scenes/cluster.ts`:
```ts
import { GENOME_CAP, type Genomes } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";

export type Clustering = {
  /** Unit-length dense centroids over entities. */
  centroids: Float32Array[];
  /** Per agent slot: centroid index, or -1. */
  assignment: Int32Array;
  sizes: number[];
};

function genomeNorm(g: Genomes, agent: number): number {
  let norm = 0;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = agent * GENOME_CAP + k;
    if (g.ids[slot] >= 0) norm += g.w[slot] * g.w[slot];
  }
  return Math.sqrt(norm);
}

/** Cosine similarity between an agent's sparse genome and a unit-length dense centroid. */
export function simToCentroid(g: Genomes, agent: number, centroid: Float32Array): number {
  const norm = genomeNorm(g, agent);
  if (norm === 0) return 0;
  let dot = 0;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = agent * GENOME_CAP + k;
    if (g.ids[slot] >= 0) dot += g.w[slot] * centroid[g.ids[slot]];
  }
  return dot / norm;
}

/** Adds the agent's unit-normalised genome into a dense vector. */
function addInto(out: Float32Array, g: Genomes, agent: number): void {
  const norm = genomeNorm(g, agent);
  if (norm === 0) return;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = agent * GENOME_CAP + k;
    if (g.ids[slot] >= 0) out[g.ids[slot]] += g.w[slot] / norm;
  }
}

/** The agent's genome as a unit-length dense vector over entities. */
export function agentVector(g: Genomes, agent: number, nEntities: number): Float32Array {
  const v = new Float32Array(nEntities);
  addInto(v, g, agent);
  return v;
}

/** Scales v to unit length in place; returns false for a zero vector. */
function normalize(v: Float32Array): boolean {
  let norm = 0;
  for (const x of v) norm += x * x;
  if (norm === 0) return false;
  const inv = 1 / Math.sqrt(norm);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return true;
}

function assign(s: SimState, centroids: Float32Array[]): Int32Array {
  const out = new Int32Array(s.alive.length).fill(-1);
  for (let i = 0; i < s.alive.length; i++) {
    if (!s.alive[i]) continue;
    let best = 0;
    for (let c = 0; c < centroids.length; c++) {
      const sim = simToCentroid(s.genomes, i, centroids[c]);
      if (sim > best) {
        best = sim;
        out[i] = c;
      }
    }
  }
  return out;
}

/**
 * Spherical k-means over agent genomes, warm-started from `seeds` (the previous scenes' centroids).
 * New scenes: sampled agents whose best similarity to every centroid is below newSceneThreshold
 * found a centroid of their own (up to maxScenes). Clusters smaller than minSceneSize are dropped
 * between iterations.
 */
export function clusterAgents(s: SimState, seeds: Float32Array[], rng: Rng): Clustering {
  const { config, genomes } = s;
  const nE = s.cw.nEntities;
  const n = s.alive.length;
  let centroids = seeds.map((c) => c.slice());

  for (let t = 0; t < config.sceneSample && centroids.length < config.maxScenes; t++) {
    const i = rng.int(n);
    if (!s.alive[i] || genomeNorm(genomes, i) === 0) continue;
    let best = 0;
    for (const c of centroids) best = Math.max(best, simToCentroid(genomes, i, c));
    if (best < config.newSceneThreshold) centroids.push(agentVector(genomes, i, nE));
  }

  for (let iter = 0; iter < config.kmeansIters && centroids.length > 0; iter++) {
    const assignment = assign(s, centroids);
    const sums = centroids.map(() => new Float32Array(nE));
    const counts = new Int32Array(centroids.length);
    for (let i = 0; i < n; i++) {
      const c = assignment[i];
      if (c < 0) continue;
      counts[c]++;
      addInto(sums[c], genomes, i);
    }
    const kept: Float32Array[] = [];
    sums.forEach((v, c) => {
      if (counts[c] >= config.minSceneSize && normalize(v)) kept.push(v);
    });
    centroids = kept;
  }

  const assignment = assign(s, centroids);
  const sizes = centroids.map(() => 0);
  for (const c of assignment) if (c >= 0) sizes[c]++;
  return { centroids, assignment, sizes };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/scenes/cluster.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/scenes/cluster.ts src/sim/scenes/cluster.test.ts
git commit -m "feat(sim): cluster agents into scenes with warm-started spherical k-means"
```

---

### Task 6: Scene lineages in the tick

**Files:** create `src/sim/scenes/lineage.ts`; test `src/sim/scenes/lineage.test.ts`; replace `src/sim/step.ts`; add a test to `src/sim/step.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/scenes/lineage.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { Clustering } from "@/sim/scenes/cluster";
import { updateLineages } from "@/sim/scenes/lineage";
import { createSceneState } from "@/sim/scenes/types";

const shares = { splitShare: 0.3, mergeShare: 0.3 };
const vec = (...xs: number[]) => Float32Array.from(xs);

/** Builds a clustering from a per-agent assignment (with -1 = unassigned) and one centroid per cluster. */
function clustering(assignment: number[], centroids: Float32Array[]): Clustering {
  const sizes = centroids.map((_, c) => assignment.filter((a) => a === c).length);
  return { centroids, assignment: Int32Array.from(assignment), sizes };
}

describe("updateLineages", () => {
  it("records births on the first run, with top entities from the centroid", () => {
    const sc = createSceneState(4);
    updateLineages(sc, clustering([0, 0, 1, 1], [vec(0.1, 0.9, 0), vec(0, 0, 1)]), 0, shares);
    expect(sc.live).toEqual([0, 1]);
    expect(sc.events.map((e) => e.kind)).toEqual(["birth", "birth"]);
    expect(sc.lineages[0].topEntities).toEqual([1, 0]);
    expect(sc.lineages[0].size).toBe(2);
  });

  it("keeps ids stable when membership continues", () => {
    const sc = createSceneState(4);
    updateLineages(sc, clustering([0, 0, 1, 1], [vec(1, 0), vec(0, 1)]), 0, shares);
    updateLineages(sc, clustering([1, 1, 0, 0], [vec(0, 1), vec(1, 0)]), 4, shares);
    expect(sc.live).toEqual([1, 0]);
    expect(sc.events).toHaveLength(2);
  });

  it("records a split with the parent lineage", () => {
    const sc = createSceneState(10);
    updateLineages(sc, clustering(Array(10).fill(0), [vec(1, 0)]), 0, shares);
    updateLineages(sc, clustering([0, 0, 0, 0, 0, 0, 1, 1, 1, 1], [vec(1, 0), vec(0, 1)]), 4, shares);
    expect(sc.live[0]).toBe(0);
    expect(sc.lineages[sc.live[1]].parent).toBe(0);
    expect(sc.events.at(-1)).toEqual({ tick: 4, kind: "split", scene: sc.live[1], other: 0 });
  });

  it("records a merge when a scene's members join another scene", () => {
    const sc = createSceneState(10);
    updateLineages(sc, clustering([0, 0, 0, 0, 0, 0, 1, 1, 1, 1], [vec(1, 0), vec(0, 1)]), 0, shares);
    updateLineages(sc, clustering(Array(10).fill(0), [vec(1, 0)]), 4, shares);
    expect(sc.live).toEqual([0]);
    expect(sc.lineages[1].diedTick).toBe(4);
    expect(sc.lineages[1].mergedInto).toBe(0);
    expect(sc.events.at(-1)).toEqual({ tick: 4, kind: "merge", scene: 1, other: 0 });
  });

  it("records an extinction when members scatter or leave", () => {
    const sc = createSceneState(4);
    updateLineages(sc, clustering([0, 0, 1, 1], [vec(1, 0), vec(0, 1)]), 0, shares);
    updateLineages(sc, clustering([0, 0, -1, -1], [vec(1, 0)]), 4, shares);
    expect(sc.lineages[1].diedTick).toBe(4);
    expect(sc.lineages[1].mergedInto).toBeNull();
    expect(sc.events.at(-1)?.kind).toBe("extinction");
  });

  it("records a fresh birth for a cluster of previously unassigned agents", () => {
    const sc = createSceneState(6);
    updateLineages(sc, clustering([0, 0, 0, -1, -1, -1], [vec(1, 0)]), 0, shares);
    updateLineages(sc, clustering([0, 0, 0, 1, 1, 1], [vec(1, 0), vec(0, 1)]), 4, shares);
    expect(sc.lineages[sc.live[1]].parent).toBeNull();
    expect(sc.events.at(-1)?.kind).toBe("birth");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/scenes/lineage.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/scenes/lineage.ts`:
```ts
import type { SimConfig } from "@/sim/config";
import type { Clustering } from "@/sim/scenes/cluster";
import type { SceneState } from "@/sim/scenes/types";

export const TOP_ENTITIES = 5;

/** Indices of the k largest positive entries, largest first (ties by index). */
export function topEntities(centroid: Float32Array, k: number): number[] {
  const best: number[] = [];
  for (let e = 0; e < centroid.length; e++) {
    if (centroid[e] <= 0) continue;
    if (best.length === k && centroid[e] <= centroid[best[k - 1]]) continue;
    if (best.length === k) best.pop();
    best.push(e);
    best.sort((a, b) => centroid[b] - centroid[a] || a - b);
  }
  return best;
}

/**
 * Matches a new clustering to the living scenes by member overlap.
 * - Each previous scene continues as the new cluster it contributes most to (if it supplies at least
 *   splitShare of it); its other such clusters are splits.
 * - Clusters with no strong predecessor are births.
 * - Scenes that don't continue are merges (if at least mergeShare of their members went to one
 *   cluster) or extinctions.
 */
export function updateLineages(
  sc: SceneState,
  cl: Clustering,
  tick: number,
  shares: Pick<SimConfig, "splitShare" | "mergeShare">,
): void {
  const nPrev = sc.live.length;
  const nNew = cl.centroids.length;
  const overlap = Array.from({ length: nPrev }, () => new Int32Array(nNew));
  const prevSize = new Int32Array(nPrev);
  for (let i = 0; i < cl.assignment.length; i++) {
    const p = sc.assignment[i];
    const c = cl.assignment[i];
    if (p >= 0) prevSize[p]++;
    if (p >= 0 && c >= 0) overlap[p][c]++;
  }

  const main = new Int32Array(nNew).fill(-1);
  for (let c = 0; c < nNew; c++) {
    let best = 0;
    for (let p = 0; p < nPrev; p++) {
      if (overlap[p][c] > best) {
        best = overlap[p][c];
        main[c] = p;
      }
    }
  }

  const born = (parent: number | null): number => {
    const id = sc.lineages.length;
    sc.lineages.push({ id, parent, bornTick: tick, diedTick: null, mergedInto: null, size: 0, peakSize: 0, topEntities: [] });
    return id;
  };

  const newIds = new Array<number>(nNew).fill(-1);
  const continued = new Uint8Array(nPrev);
  for (let p = 0; p < nPrev; p++) {
    const mine: number[] = [];
    for (let c = 0; c < nNew; c++) {
      if (main[c] === p && overlap[p][c] >= shares.splitShare * cl.sizes[c]) mine.push(c);
    }
    mine.sort((a, b) => overlap[p][b] - overlap[p][a] || a - b);
    mine.forEach((c, k) => {
      if (k === 0) {
        newIds[c] = sc.live[p];
        continued[p] = 1;
      } else {
        newIds[c] = born(sc.live[p]);
        sc.events.push({ tick, kind: "split", scene: newIds[c], other: sc.live[p] });
      }
    });
  }

  for (let c = 0; c < nNew; c++) {
    if (newIds[c] !== -1) continue;
    newIds[c] = born(null);
    sc.events.push({ tick, kind: "birth", scene: newIds[c], other: null });
  }

  for (let p = 0; p < nPrev; p++) {
    if (continued[p]) continue;
    const id = sc.live[p];
    const lineage = sc.lineages[id];
    lineage.diedTick = tick;
    let into = -1;
    let best = 0;
    for (let c = 0; c < nNew; c++) {
      if (overlap[p][c] > best) {
        best = overlap[p][c];
        into = c;
      }
    }
    if (into >= 0 && best >= shares.mergeShare * prevSize[p]) {
      lineage.mergedInto = newIds[into];
      sc.events.push({ tick, kind: "merge", scene: id, other: newIds[into] });
    } else {
      sc.events.push({ tick, kind: "extinction", scene: id, other: null });
    }
  }

  for (let c = 0; c < nNew; c++) {
    const lineage = sc.lineages[newIds[c]];
    lineage.size = cl.sizes[c];
    lineage.peakSize = Math.max(lineage.peakSize, cl.sizes[c]);
    lineage.topEntities = topEntities(cl.centroids[c], TOP_ENTITIES);
  }
  sc.live = newIds;
  sc.centroids = cl.centroids;
  sc.assignment = cl.assignment;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/scenes/lineage.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Wire scenes into the tick.** In `src/sim/step.ts`, add these imports:
```ts
import { clusterAgents } from "@/sim/scenes/cluster";
import { updateLineages } from "@/sim/scenes/lineage";
```
Insert after `if (updateVenues(s)) s.nearbyVenues = buildNearbyVenues(s);`:
```ts
  if (s.tick % s.config.sceneEvery === 0) {
    updateLineages(s.scenes, clusterAgents(s, s.scenes.centroids, rng), s.tick, s.config);
  }
```

- [ ] **Step 6: Add a scene test to `src/sim/step.test.ts`** (inside `describe("step", …)`)

```ts
  it("tracks scenes: three are born at tick 0 and survive a quiet run", () => {
    const s = run(4, 20);
    const births = s.scenes.events.filter((e) => e.kind === "birth" && e.tick === 0);
    expect(births.length).toBeGreaterThanOrEqual(3);
    expect(s.scenes.live.length).toBeGreaterThanOrEqual(3);
    for (const id of s.scenes.live) expect(s.scenes.lineages[id].topEntities.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 7: Verify**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm bench:sim`.
Expected: all pass; bench ≥ 10 ticks/sec (clustering runs every 4th tick).

- [ ] **Step 8: Commit**

```bash
git add src/sim/scenes/lineage.ts src/sim/scenes/lineage.test.ts src/sim/step.ts src/sim/step.test.ts
git commit -m "feat(sim): track scene lineages with births, splits, merges and extinctions"
```

---

### Task 7: Empty niches and auto-opening venues

**Files:** create `src/sim/niches.ts`; test `src/sim/niches.test.ts`; modify `src/sim/step.ts`; add a test to `src/sim/step.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/niches.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { autoOpenVenue, findNiches } from "@/sim/niches";
import { createRng } from "@/sim/rng";
import { clusterAgents } from "@/sim/scenes/cluster";
import { updateLineages } from "@/sim/scenes/lineage";
import { initState } from "@/sim/state";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const clusterOf = (e: number) => Math.floor(e / 12);

function withScenes(overrides = {}) {
  const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 0, minSceneSize: 20, ...overrides }, 3);
  updateLineages(s.scenes, clusterAgents(s, [], createRng(1)), 0, s.config);
  return s;
}

describe("findNiches", () => {
  it("returns nothing before any scenes exist", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 50, agentReserve: 0 }, 1);
    expect(findNiches(s, 3)).toEqual([]);
  });

  it("ranks unserved scenes first and proposes a matching place in their home turf", () => {
    const s = withScenes();
    s.venueOpen.fill(0);
    const niches = findNiches(s, 3);
    expect(niches).toHaveLength(3);
    expect(niches[0].score).toBeGreaterThanOrEqual(niches[1].score);
    for (const n of niches) {
      const scene = s.scenes.lineages[n.scene];
      expect(clusterOf(n.entity)).toBe(clusterOf(scene.topEntities[0]));
      expect(world.entities[n.entity].type).toBe("place");
      expect(n.cell).toBeLessThan(world.cells.length);
      expect(n.score).toBe(scene.size);
    }
  });

  it("scores well-served scenes lower", () => {
    const s = withScenes();
    const before = findNiches(s, 3).map((n) => n.score);
    s.venueCapacity.fill(1e6);
    const after = findNiches(s, 3).map((n) => n.score);
    expect(Math.max(...after)).toBeLessThan(Math.min(...before));
  });
});

describe("autoOpenVenue", () => {
  it("opens a venue for an underserved scene", () => {
    const s = withScenes();
    s.venueOpen.fill(0);
    const v = autoOpenVenue(s);
    expect(v).toBe(12);
    expect(s.venueOpen[v]).toBe(1);
    expect(s.nVenues).toBe(13);
  });

  it("does nothing when disabled, when demand is met, or when the table is full", () => {
    const off = withScenes({ autoOpen: false });
    off.venueOpen.fill(0);
    expect(autoOpenVenue(off)).toBe(-1);

    const served = withScenes();
    served.venueCapacity.fill(1e6);
    expect(autoOpenVenue(served)).toBe(-1);

    const full = withScenes({ venueReserve: 0 });
    full.venueOpen.fill(0);
    expect(autoOpenVenue(full)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/niches.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/niches.ts`:
```ts
import type { SimState } from "@/sim/state";
import { addVenue, buildNearbyVenues } from "@/sim/venue-table";
import { DEFAULT_VENUE_CAPACITY, writeVenueProfile } from "@/sim/world-index";

/** An underserved scene, where it lives, and the real place that best matches its taste. */
export type Niche = { scene: number; score: number; cell: number; entity: number };

function cosine(profile: Float32Array, offset: number, nE: number, centroid: Float32Array): number {
  let dot = 0;
  let norm = 0;
  for (let e = 0; e < nE; e++) {
    const p = profile[offset + e];
    if (p === 0) continue;
    dot += p * centroid[e];
    norm += p * p;
  }
  return norm > 0 ? dot / Math.sqrt(norm) : 0;
}

/**
 * Living scenes ranked by unmet demand: score = scene size ÷ (1 + Σ open permanent venues'
 * rent-adjusted capacity × taste match). Each niche names the cell where most members live and the
 * place entity whose profile best matches the scene.
 */
export function findNiches(s: SimState, limit: number): Niche[] {
  const sc = s.scenes;
  const nE = s.cw.nEntities;
  if (sc.live.length === 0) return [];

  const sizes = new Int32Array(sc.live.length);
  const cellCounts = sc.live.map(() => new Map<number, number>());
  for (let i = 0; i < sc.assignment.length; i++) {
    const a = sc.assignment[i];
    if (a < 0 || !s.alive[i]) continue;
    sizes[a]++;
    const counts = cellCounts[a];
    counts.set(s.homeCell[i], (counts.get(s.homeCell[i]) ?? 0) + 1);
  }

  const ranked = sc.live
    .map((id, a) => {
      let served = 0;
      for (let v = 0; v < s.nVenues; v++) {
        if (!s.venueOpen[v] || s.venueExpires[v] >= 0) continue;
        const match = cosine(s.venueProfile, v * nE, nE, sc.centroids[a]);
        if (match > 0) served += (match * s.venueCapacity[v]) / s.cellRent[s.venueCell[v]];
      }
      return { a, id, score: sizes[a] / (1 + served) };
    })
    .sort((x, y) => y.score - x.score || x.a - y.a)
    .slice(0, limit);

  const row = new Float32Array(nE);
  return ranked.map(({ a, id, score }) => {
    let cell = 0;
    let most = -1;
    for (const [c, k] of cellCounts[a]) {
      if (k > most || (k === most && c < cell)) {
        most = k;
        cell = c;
      }
    }
    let entity = -1;
    let best = -Infinity;
    for (const p of s.cw.places) {
      writeVenueProfile(s.cw, p, row, 0);
      const match = cosine(row, 0, nE, sc.centroids[a]);
      if (match > best) {
        best = match;
        entity = p;
      }
    }
    return { scene: id, score, cell, entity };
  });
}

/** Opens a venue in the most underserved niche if its score reaches autoOpenScore. Returns the slot or -1. */
export function autoOpenVenue(s: SimState): number {
  if (!s.config.autoOpen || s.nVenues >= s.venueEntity.length) return -1;
  const [top] = findNiches(s, 1);
  if (!top || top.entity < 0 || top.score < s.config.autoOpenScore) return -1;
  const v = addVenue(s, top.entity, top.cell, DEFAULT_VENUE_CAPACITY);
  s.nearbyVenues = buildNearbyVenues(s);
  return v;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/niches.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Wire auto-opening into the tick.** In `src/sim/step.ts`, add `import { autoOpenVenue } from "@/sim/niches";`, and inside the `if (s.tick % s.config.sceneEvery === 0) { … }` block, after `updateLineages(…)`, add:
```ts
    autoOpenVenue(s);
```

- [ ] **Step 6: Add an ecology test to `src/sim/step.test.ts`** (inside `describe("step", …)`). Add `import { DEFAULT_CONFIG } from "@/sim/config";` only if it isn't already imported.

```ts
  it("re-grows supply: after a whole scene's venues close, a matching venue opens", () => {
    const s = initState(makeTinyWorld(), config, 6);
    step(s);
    const venuesOfCluster0 = Array.from({ length: s.nVenues }, (_, v) => v).filter(
      (v) => Math.floor(s.venueEntity[v] / 12) === 0,
    );
    step(s, venuesOfCluster0.map((venue) => ({ type: "closeVenue" as const, venue })));
    for (let t = 0; t < 12; t++) step(s);
    const reopened = Array.from({ length: s.nVenues }, (_, v) => v).filter(
      (v) => v >= 12 && s.venueOpen[v] && Math.floor(s.venueEntity[v] / 12) === 0,
    );
    expect(reopened.length).toBeGreaterThan(0);
  });
```

- [ ] **Step 7: Verify**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm bench:sim`.
Expected: all pass; bench ≥ 10 ticks/sec.

- [ ] **Step 8: Commit**

```bash
git add src/sim/niches.ts src/sim/niches.test.ts src/sim/step.ts src/sim/step.test.ts
git commit -m "feat(sim): detect empty niches and auto-open matching venues"
```

---

### Task 8: Calibration metric

**Files:** create `src/sim/calibration.ts`, `scripts/calibrate.ts`; test `src/sim/calibration.test.ts`; modify `package.json`.

- [ ] **Step 1: Write the failing test**

`src/sim/calibration.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { computeFidelity, ranks, spearman } from "@/sim/calibration";
import { DEFAULT_CONFIG } from "@/sim/config";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

describe("ranks / spearman", () => {
  it("averages tied ranks", () => {
    expect(Array.from(ranks([10, 20, 20, 30]))).toEqual([1, 2.5, 2.5, 4]);
  });

  it("is 1 for monotone, -1 for reversed, 0 for constant or tiny inputs", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 99])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 2, 3], [5, 5, 5])).toBe(0);
    expect(spearman([1], [2])).toBe(0);
  });
});

describe("computeFidelity", () => {
  const world = makeTinyWorld();
  const config = { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 0 };

  it("is high for a population seeded from the same archetypes as the heatmaps", () => {
    const f = computeFidelity(initState(world, config, 1));
    expect(f.perHeatmap).toHaveLength(world.heatmaps.length);
    expect(f.mean).toBeGreaterThan(0.7);
  });

  it("drops when agents are scattered at random", () => {
    const s = initState(world, config, 1);
    const before = computeFidelity(s).mean;
    const rng = createRng(5);
    for (let i = s.homeCell.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [s.homeCell[i], s.homeCell[j]] = [s.homeCell[j], s.homeCell[i]];
    }
    expect(computeFidelity(s).mean).toBeLessThan(before);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/calibration.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/calibration.ts`:
```ts
import { geneSlot } from "@/sim/genome";
import type { SimState } from "@/sim/state";

/** 1-based ranks with ties averaged. */
export function ranks(values: ArrayLike<number>): Float64Array {
  const order = Array.from({ length: values.length }, (_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  const out = new Float64Array(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]] = rank;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation; 0 when undefined (fewer than 2 points or no variance). */
export function spearman(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  if (n < 2) return 0;
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (n + 1) / 2;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - mean) * (rb[i] - mean);
    va += (ra[i] - mean) ** 2;
    vb += (rb[i] - mean) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

export type Fidelity = { perHeatmap: { entity: number; rho: number }[]; mean: number };

/**
 * Baseline fidelity: for each Qloo heatmap, the rank correlation across populated cells between the
 * simulated following (mean gene weight of the entity among residents) and the real heatmap affinity.
 */
export function computeFidelity(s: SimState): Fidelity {
  const nC = s.cw.nCells;
  const population = new Float64Array(nC);
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i]) population[s.homeCell[i]]++;
  const cells = Array.from({ length: nC }, (_, c) => c).filter((c) => population[c] > 0);

  const perHeatmap = s.cw.world.heatmaps.map((h) => {
    const following = new Float64Array(nC);
    for (let i = 0; i < s.alive.length; i++) {
      if (!s.alive[i]) continue;
      const slot = geneSlot(s.genomes, i, h.entity);
      if (slot >= 0) following[s.homeCell[i]] += s.genomes.w[slot];
    }
    const sim = cells.map((c) => following[c] / population[c]);
    const real = cells.map((c) => h.values[c]);
    return { entity: h.entity, rho: spearman(sim, real) };
  });
  const mean = perHeatmap.length > 0 ? perHeatmap.reduce((acc, x) => acc + x.rho, 0) / perHeatmap.length : 0;
  return { perHeatmap, mean };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/calibration.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Add the calibration report script**

`scripts/calibrate.ts`:
```ts
import { computeFidelity } from "@/sim/calibration";
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

// Baseline run report for tuning: fidelity vs heatmaps plus ecology vitals, every 10 ticks.
// Uses the synthetic fixture until Plan 4 provides real World files.
const TICKS = 100;
const world = makeTinyWorld({ seed: 7, clusters: 6, entitiesPerCluster: 20, gridSize: 10 });
const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 2000 }, 7);

const report = () => {
  const open = Array.from(s.venueOpen.subarray(0, s.nVenues)).filter((x) => x === 1).length;
  const genes = Array.from(s.genomes.ids).filter((x) => x >= 0).length;
  const alive = Array.from(s.alive).filter((x) => x === 1).length;
  console.log(
    `tick=${s.tick} fidelity=${computeFidelity(s).mean.toFixed(3)} venues=${open}/${s.nVenues} ` +
      `scenes=${s.scenes.live.length} genes/agent=${(genes / alive).toFixed(1)}`,
  );
};

report();
for (let t = 1; t <= TICKS; t++) {
  step(s);
  if (t % 10 === 0) report();
}
```

Add this to the `"scripts"` object in `package.json`:
```json
"calibrate": "tsx scripts/calibrate.ts"
```

Run: `pnpm calibrate`
Expected: 11 lines from `tick=0` to `tick=100`, each with a fidelity in [-1, 1].

- [ ] **Step 6: Commit**

```bash
git add src/sim/calibration.ts src/sim/calibration.test.ts scripts/calibrate.ts package.json
git commit -m "feat(sim): add heatmap fidelity metric and calibration report"
```

---

### Task 9: State digest

**Files:** create `src/sim/digest.ts`; test `src/sim/digest.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/digest.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { digest, RECENT } from "@/sim/digest";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const config = { ...DEFAULT_CONFIG, nAgents: 400, agentReserve: 0 };

describe("digest", () => {
  it("summarises a fresh state", () => {
    const d = digest(initState(world, config, 1));
    expect(d.tick).toBe(0);
    expect(d.agents).toBe(400);
    expect(d.venues).toEqual({ open: 12, closed: 0, events: 0 });
    expect(d.scenes).toEqual([]);
    expect(d.fidelity).toBeGreaterThan(0);
  });

  it("lists living scenes largest first with entity names, plus recent actions", () => {
    const s = initState(world, config, 1);
    step(s, [{ type: "closeVenue", venue: 0 }]);
    const d = digest(s);
    expect(d.scenes.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < d.scenes.length; k++) expect(d.scenes[k - 1].size).toBeGreaterThanOrEqual(d.scenes[k].size);
    expect(d.scenes[0].topEntities[0].name).toBe(world.entities[d.scenes[0].topEntities[0].index].name);
    expect(d.recentActions).toEqual([{ tick: 0, action: { type: "closeVenue", venue: 0 } }]);
    expect(d.venues.closed).toBeGreaterThanOrEqual(1);
    expect(d.recentSceneEvents.length).toBeLessThanOrEqual(RECENT);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/digest.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/digest.ts`:
```ts
import type { ActionLogEntry } from "@/sim/actions/schema";
import { computeFidelity } from "@/sim/calibration";
import type { SceneEvent } from "@/sim/scenes/types";
import type { SimState } from "@/sim/state";

export const RECENT = 10;

export type SceneSummary = {
  id: number;
  parent: number | null;
  bornTick: number;
  size: number;
  topEntities: { index: number; name: string }[];
};

/** Compact, serialisable view of a state for the UI and the co-pilot. */
export type SimDigest = {
  tick: number;
  agents: number;
  venues: { open: number; closed: number; events: number };
  scenes: SceneSummary[];
  recentSceneEvents: SceneEvent[];
  recentActions: ActionLogEntry[];
  fidelity: number;
};

export function digest(s: SimState): SimDigest {
  let agents = 0;
  for (const x of s.alive) agents += x;

  const venues = { open: 0, closed: 0, events: 0 };
  for (let v = 0; v < s.nVenues; v++) {
    if (s.venueExpires[v] >= 0) {
      if (s.venueOpen[v]) venues.events++;
    } else if (s.venueOpen[v]) venues.open++;
    else venues.closed++;
  }

  const entities = s.cw.world.entities;
  const scenes = s.scenes.live
    .map((id) => {
      const l = s.scenes.lineages[id];
      return {
        id,
        parent: l.parent,
        bornTick: l.bornTick,
        size: l.size,
        topEntities: l.topEntities.map((index) => ({ index, name: entities[index].name })),
      };
    })
    .sort((a, b) => b.size - a.size || a.id - b.id);

  return {
    tick: s.tick,
    agents,
    venues,
    scenes,
    recentSceneEvents: s.scenes.events.slice(-RECENT),
    recentActions: s.log.slice(-RECENT),
    fidelity: computeFidelity(s).mean,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/digest.test.ts`
Expected: `2 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/digest.ts src/sim/digest.test.ts
git commit -m "feat(sim): add serialisable state digest for UI and co-pilot"
```

---

### Task 10: Timeline (snapshots, rewind, fork)

**Files:** create `src/sim/timeline.ts`; test `src/sim/timeline.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/timeline.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { hashState } from "@/sim/hash";
import { Timeline } from "@/sim/timeline";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const config = { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 50 };
const create = (snapshotEvery = 10) => Timeline.create(world, config, 4, snapshotEvery);

describe("Timeline", () => {
  it("advances and applies queued actions on the next tick", () => {
    const t = create();
    expect(t.queue({ type: "closeVenue", venue: 0 })).toBeNull();
    const results = t.advance(3);
    expect(results).toEqual([{ ok: true, venue: 0 }]);
    expect(t.state.tick).toBe(3);
    expect(t.state.log).toEqual([{ tick: 0, action: { type: "closeVenue", venue: 0 } }]);
  });

  it("refuses invalid actions up front", () => {
    const t = create();
    expect(t.queue({ type: "closeVenue", venue: 999 })).toMatch(/unknown venue/);
    expect(t.advance(1)).toEqual([]);
  });

  it("is deterministic across timelines with the same seed", () => {
    const a = create();
    const b = create();
    a.advance(20);
    b.advance(20);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it("rewinds exactly, replaying logged actions from the nearest snapshot", () => {
    const t = create(10);
    t.advance(5);
    t.queue({ type: "openVenue", entity: 30, cell: 2 });
    t.advance(7);
    const at12 = hashState(t.state);
    t.advance(6);
    t.rewind(12);
    expect(t.state.tick).toBe(12);
    expect(hashState(t.state)).toBe(at12);
  });

  it("discards later history after a rewind", () => {
    const t = create(10);
    t.advance(15);
    t.queue({ type: "closeVenue", venue: 1 });
    t.advance(5);
    t.rewind(12);
    expect(t.state.log).toEqual([]);
    expect(t.state.venueOpen[1]).toBe(1);
  });

  it("rejects rewinding into the future", () => {
    const t = create();
    t.advance(3);
    expect(() => t.rewind(4)).toThrow();
  });

  it("forks into an independent timeline", () => {
    const t = create();
    t.advance(5);
    const f = t.fork();
    f.queue({ type: "closeVenue", venue: 0 });
    f.advance(5);
    t.advance(5);
    expect(t.state.venueOpen[0]).toBe(1);
    expect(f.state.venueOpen[0]).toBe(0);
    expect(hashState(t.state)).not.toBe(hashState(f.state));
    f.rewind(2);
    expect(f.state.tick).toBe(2);
  });

  it("caps stored snapshots but can still rewind to the start", () => {
    const t = create(1);
    t.advance(50);
    t.rewind(0);
    expect(t.state.tick).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/timeline.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/timeline.ts`:
```ts
import { validateAction } from "@/sim/actions/apply";
import type { Action, ActionResult } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import { cloneState, initState, type SimState } from "@/sim/state";
import { step } from "@/sim/step";
import type { World } from "@/world/schema";

export const DEFAULT_SNAPSHOT_EVERY = 10;
export const MAX_SNAPSHOTS = 30;

/**
 * A simulation run you can steer and rewind. Actions are queued and applied at the start of the next
 * tick. Snapshots are taken every `snapshotEvery` ticks. A rewind restores the nearest earlier
 * snapshot and replays the action log, so it is exact.
 */
export class Timeline {
  state: SimState;
  private pending: Action[] = [];
  private readonly snapshots: Map<number, SimState>;

  constructor(
    state: SimState,
    private readonly snapshotEvery = DEFAULT_SNAPSHOT_EVERY,
    snapshots?: Map<number, SimState>,
  ) {
    this.state = state;
    this.snapshots = snapshots ?? new Map([[state.tick, cloneState(state)]]);
  }

  static create(world: World, config: SimConfig, seed: number, snapshotEvery?: number): Timeline {
    return new Timeline(initState(world, config, seed), snapshotEvery);
  }

  /** Queues an action for the next tick; returns why it can't apply, or null if queued. */
  queue(action: Action): string | null {
    const error = validateAction(this.state, action);
    if (!error) this.pending.push(action);
    return error;
  }

  advance(ticks: number): ActionResult[] {
    const results: ActionResult[] = [];
    for (let t = 0; t < ticks; t++) {
      const actions = this.pending;
      this.pending = [];
      results.push(...step(this.state, actions));
      if (this.state.tick % this.snapshotEvery === 0) this.snapshot();
    }
    return results;
  }

  /** Earliest tick that can be rewound to. */
  earliest(): number {
    return Math.min(...this.snapshots.keys());
  }

  /** Restores the exact state at `tick` (between earliest() and now). Later history is discarded. */
  rewind(tick: number): void {
    if (!Number.isInteger(tick) || tick < this.earliest() || tick > this.state.tick) {
      throw new Error(`cannot rewind to tick ${tick} (range ${this.earliest()}..${this.state.tick})`);
    }
    const base = Math.max(...[...this.snapshots.keys()].filter((k) => k <= tick));
    const s = cloneState(this.snapshots.get(base) as SimState);
    const replay = this.state.log.filter((e) => e.tick >= base && e.tick < tick);
    while (s.tick < tick) step(s, replay.filter((e) => e.tick === s.tick).map((e) => e.action));
    for (const k of [...this.snapshots.keys()]) if (k > tick) this.snapshots.delete(k);
    this.pending = [];
    this.state = s;
  }

  /** An independent timeline that shares history (snapshots are never mutated) up to now. */
  fork(): Timeline {
    const t = new Timeline(cloneState(this.state), this.snapshotEvery, new Map(this.snapshots));
    t.pending = [...this.pending];
    return t;
  }

  private snapshot(): void {
    this.snapshots.set(this.state.tick, cloneState(this.state));
    if (this.snapshots.size > MAX_SNAPSHOTS) {
      // Keep the earliest snapshot so the start stays reachable; drop the next oldest.
      const keys = [...this.snapshots.keys()].sort((a, b) => a - b);
      this.snapshots.delete(keys[1]);
    }
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/timeline.test.ts`
Expected: `8 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/timeline.ts src/sim/timeline.test.ts
git commit -m "feat(sim): add timeline with snapshots, exact rewind and fork"
```

---

### Task 11: Worker host, entry and client

**Files:** create `src/sim/worker/protocol.ts`, `src/sim/worker/host.ts`, `src/sim/worker/sim.worker.ts`, `src/sim/worker/client.ts`; tests `src/sim/worker/host.test.ts`, `src/sim/worker/client.test.ts`.

- [ ] **Step 1: Write the failing tests**

`src/sim/worker/host.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SimHost } from "@/sim/worker/host";
import type { WorkerCommand, WorkerResponse } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { nAgents: 300, agentReserve: 50 };
let id = 0;
const send = (host: SimHost, cmd: WorkerCommand): WorkerResponse => host.handle({ ...cmd, id: ++id });
const ok = (r: WorkerResponse) => {
  if (!r.ok) throw new Error(r.error);
  return r.result as Record<string, unknown> & { digest: { tick: number; recentActions: unknown[] } };
};

describe("SimHost", () => {
  it("initialises the main timeline and runs it", () => {
    const host = new SimHost();
    const init = ok(send(host, { type: "init", world: makeTinyWorld(), seed: 1, config }));
    expect(init.timeline).toBe("main");
    expect(init.digest.tick).toBe(0);
    expect(ok(send(host, { type: "run", timeline: "main", ticks: 5 })).digest.tick).toBe(5);
  });

  it("queues valid actions and reports invalid ones", () => {
    const host = new SimHost();
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    expect(ok(send(host, { type: "act", timeline: "main", action: { type: "closeVenue", venue: 0 } }))).toEqual({ queued: true });
    expect(ok(send(host, { type: "run", timeline: "main", ticks: 1 })).digest.recentActions).toHaveLength(1);
    const bad = send(host, { type: "act", timeline: "main", action: { type: "closeVenue", venue: 999 } });
    expect(bad.ok).toBe(false);
    expect(send(host, { type: "act", timeline: "main", action: { type: "nope" } }).ok).toBe(false);
  });

  it("forks, rewinds and disposes timelines", () => {
    const host = new SimHost();
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    send(host, { type: "run", timeline: "main", ticks: 4 });
    const fork = ok(send(host, { type: "fork", timeline: "main" }));
    expect(fork.timeline).toBe("fork-1");
    send(host, { type: "run", timeline: "fork-1", ticks: 3 });
    expect(ok(send(host, { type: "digest", timeline: "main" })).digest.tick).toBe(4);
    expect(ok(send(host, { type: "rewind", timeline: "fork-1", tick: 2 })).digest.tick).toBe(2);
    expect(ok(send(host, { type: "dispose", timeline: "fork-1" }))).toEqual({ disposed: true });
    expect(send(host, { type: "digest", timeline: "fork-1" }).ok).toBe(false);
    expect(send(host, { type: "dispose", timeline: "main" }).ok).toBe(false);
  });

  it("returns errors instead of throwing", () => {
    const host = new SimHost();
    expect(send(host, { type: "init", world: { nope: true }, seed: 1 }).ok).toBe(false);
    expect(send(host, { type: "run", timeline: "main", ticks: 1 }).ok).toBe(false);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    expect(send(host, { type: "run", timeline: "main", ticks: 0 }).ok).toBe(false);
  });
});
```

`src/sim/worker/client.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SimClient, type WorkerLike } from "@/sim/worker/client";
import { SimHost } from "@/sim/worker/host";
import type { WorkerRequest, WorkerResponse } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

/** In-process stand-in for a Web Worker: same message flow, asynchronous like the real thing. */
function fakeWorker(): WorkerLike {
  const host = new SimHost();
  const listeners: ((e: MessageEvent<WorkerResponse>) => void)[] = [];
  return {
    postMessage: (message) =>
      queueMicrotask(() => {
        const response = host.handle(message as WorkerRequest);
        listeners.forEach((l) => l({ data: response } as MessageEvent<WorkerResponse>));
      }),
    addEventListener: (_type, listener) => listeners.push(listener),
    terminate: () => {},
  };
}

describe("SimClient", () => {
  it("round-trips commands through the worker protocol", async () => {
    const client = new SimClient(fakeWorker());
    const init = await client.init(makeTinyWorld(), 1, { nAgents: 200, agentReserve: 0 });
    expect(init.timeline).toBe("main");
    const run = await client.run("main", 3);
    expect(run.digest.tick).toBe(3);
    await expect(client.act("main", { type: "closeVenue", venue: 999 })).rejects.toThrow(/unknown venue/);
    const fork = await client.fork("main");
    expect(fork.timeline).toBe("fork-1");
  });

  it("rejects pending requests when terminated", async () => {
    const worker = fakeWorker();
    const client = new SimClient({ ...worker, postMessage: () => {} });
    const pending = client.digest("main");
    client.terminate();
    await expect(pending).rejects.toThrow(/terminated/);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test src/sim/worker`
Expected: FAIL. The modules cannot be resolved.

- [ ] **Step 3: Implement the protocol**

`src/sim/worker/protocol.ts`:
```ts
import type { ActionResult } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { SimDigest } from "@/sim/digest";

export const MAIN_TIMELINE = "main";
export const MAX_TICKS_PER_RUN = 520;

export type WorkerCommand =
  | { type: "init"; world: unknown; seed: number; config?: Partial<SimConfig> }
  | { type: "act"; timeline: string; action: unknown }
  | { type: "run"; timeline: string; ticks: number }
  | { type: "rewind"; timeline: string; tick: number }
  | { type: "fork"; timeline: string }
  | { type: "digest"; timeline: string }
  | { type: "dispose"; timeline: string };

export type WorkerRequest = WorkerCommand & { id: number };

export type CommandResults = {
  init: { timeline: string; digest: SimDigest };
  act: { queued: true };
  run: { digest: SimDigest; results: ActionResult[] };
  rewind: { digest: SimDigest };
  fork: { timeline: string; digest: SimDigest };
  digest: { digest: SimDigest };
  dispose: { disposed: true };
};

export type CommandResult = CommandResults[keyof CommandResults];

export type WorkerResponse =
  | { id: number; ok: true; result: CommandResult }
  | { id: number; ok: false; error: string };
```

- [ ] **Step 4: Implement the host**

`src/sim/worker/host.ts`:
```ts
import { parseAction } from "@/sim/actions/schema";
import { DEFAULT_CONFIG } from "@/sim/config";
import { digest } from "@/sim/digest";
import { Timeline } from "@/sim/timeline";
import {
  type CommandResult,
  MAIN_TIMELINE,
  MAX_TICKS_PER_RUN,
  type WorkerCommand,
  type WorkerRequest,
  type WorkerResponse,
} from "@/sim/worker/protocol";
import { parseWorld } from "@/world/schema";

/** Owns the simulation timelines inside the worker. Every request gets exactly one response; it never throws. */
export class SimHost {
  private readonly timelines = new Map<string, Timeline>();
  private forks = 0;

  handle(req: WorkerRequest): WorkerResponse {
    try {
      return { id: req.id, ok: true, result: this.execute(req) };
    } catch (e) {
      return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private timeline(id: string): Timeline {
    const t = this.timelines.get(id);
    if (!t) throw new Error(`unknown timeline "${id}"`);
    return t;
  }

  private execute(cmd: WorkerCommand): CommandResult {
    switch (cmd.type) {
      case "init": {
        const t = Timeline.create(parseWorld(cmd.world), { ...DEFAULT_CONFIG, ...cmd.config }, cmd.seed);
        this.timelines.clear();
        this.forks = 0;
        this.timelines.set(MAIN_TIMELINE, t);
        return { timeline: MAIN_TIMELINE, digest: digest(t.state) };
      }
      case "act": {
        const error = this.timeline(cmd.timeline).queue(parseAction(cmd.action));
        if (error) throw new Error(error);
        return { queued: true };
      }
      case "run": {
        if (!Number.isInteger(cmd.ticks) || cmd.ticks < 1 || cmd.ticks > MAX_TICKS_PER_RUN) {
          throw new Error(`ticks must be an integer in [1, ${MAX_TICKS_PER_RUN}]`);
        }
        const t = this.timeline(cmd.timeline);
        const results = t.advance(cmd.ticks);
        return { digest: digest(t.state), results };
      }
      case "rewind": {
        const t = this.timeline(cmd.timeline);
        t.rewind(cmd.tick);
        return { digest: digest(t.state) };
      }
      case "fork": {
        const t = this.timeline(cmd.timeline).fork();
        const id = `fork-${++this.forks}`;
        this.timelines.set(id, t);
        return { timeline: id, digest: digest(t.state) };
      }
      case "digest":
        return { digest: digest(this.timeline(cmd.timeline).state) };
      case "dispose": {
        if (cmd.timeline === MAIN_TIMELINE) throw new Error("cannot dispose the main timeline");
        this.timeline(cmd.timeline);
        this.timelines.delete(cmd.timeline);
        return { disposed: true };
      }
    }
  }
}
```

- [ ] **Step 5: Implement the worker entry and client**

`src/sim/worker/sim.worker.ts`:
```ts
import { SimHost } from "@/sim/worker/host";
import type { WorkerRequest } from "@/sim/worker/protocol";

// Web Worker entry: one SimHost per worker; every request gets exactly one response.
const host = new SimHost();
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown): void;
};
scope.onmessage = (e) => scope.postMessage(host.handle(e.data));
```

`src/sim/worker/client.ts`:
```ts
import type { Action } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { CommandResults, WorkerCommand, WorkerResponse } from "@/sim/worker/protocol";

/** The subset of the Worker API the client needs (lets tests use an in-process fake). */
export type WorkerLike = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: MessageEvent<WorkerResponse>) => void): void;
  terminate(): void;
};

type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void };

/** Promise-based API over the simulation worker. */
export class SimClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly worker: WorkerLike) {
    worker.addEventListener("message", (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    });
  }

  /** Browser only: spawns the simulation Web Worker. */
  static spawn(): SimClient {
    const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    return new SimClient(worker as unknown as WorkerLike);
  }

  private request<K extends WorkerCommand["type"]>(cmd: Extract<WorkerCommand, { type: K }>): Promise<CommandResults[K]> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject });
      this.worker.postMessage({ ...cmd, id });
    });
  }

  init(world: unknown, seed: number, config?: Partial<SimConfig>) {
    return this.request<"init">({ type: "init", world, seed, config });
  }
  act(timeline: string, action: Action) {
    return this.request<"act">({ type: "act", timeline, action });
  }
  run(timeline: string, ticks: number) {
    return this.request<"run">({ type: "run", timeline, ticks });
  }
  rewind(timeline: string, tick: number) {
    return this.request<"rewind">({ type: "rewind", timeline, tick });
  }
  fork(timeline: string) {
    return this.request<"fork">({ type: "fork", timeline });
  }
  digest(timeline: string) {
    return this.request<"digest">({ type: "digest", timeline });
  }
  dispose(timeline: string) {
    return this.request<"dispose">({ type: "dispose", timeline });
  }

  /** Stops the worker and rejects anything still waiting. */
  terminate(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error("worker terminated"));
    this.pending.clear();
  }
}
```

- [ ] **Step 6: Run them to verify they pass**

Run: `pnpm test src/sim/worker`, then `pnpm exec tsc --noEmit` and `pnpm lint`.
Expected: `6 passed`; tsc and lint clean.

- [ ] **Step 7: Commit**

```bash
git add src/sim/worker
git commit -m "feat(sim): add web worker host, protocol and promise client"
```

---

### Task 12: Verify and update the handoff docs

**Files:** modify `docs/architecture.md`, `docs/current-state.md`, `docs/superpowers/plans/2026-10-09-roadmap.md`.

- [ ] **Step 1: Full verification**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm build`, `pnpm bench:sim`, `pnpm calibrate`.
Expected: everything passes; bench ≥ 10 ticks/sec. Record the bench line and the calibrate output (first and last lines).

- [ ] **Step 2: Update `docs/architecture.md`**

Replace the `sim/` and `actions/` bullets under "Components" with:
```markdown
- **`sim/`** — pure, deterministic TypeScript engine (no network, no DOM):
  - `state.ts` + `venue-table.ts` — agent slots with an `alive` mask, per-state venue table (decision 0004)
  - `steps/` — outing → attendance → exposure/adoption → drift → decay → venue lifecycle
  - `actions/` — zod action schema shared by toolbar and co-pilot; `applyAction` (close/open venue, event, migrate, rent)
  - `scenes/` — spherical k-means scenes + lineage tracking (birth/split/merge/extinction)
  - `niches.ts` — unmet-demand niches; auto-opens matching venues
  - `calibration.ts` — Spearman fidelity vs Qloo heatmaps
  - `digest.ts` — compact serialisable summary for UI/co-pilot
  - `timeline.ts` — snapshots, exact rewind (snapshot + action-log replay), fork
  - `worker/` — Web Worker host, protocol and `SimClient`
```
Add `- \`pnpm calibrate\` — baseline fidelity and ecology report` to "Commands".

- [ ] **Step 3: Update `docs/current-state.md`**

- Set **Phase** to "Plan 2 complete (sim ecology)".
- Add Plan 2 to "Done", with the bench line and the calibrate summary.
- Replace "Carry into Plan 2" with "Carry forward". Keep only the items still open:
  - determinism within one JS engine only;
  - tuning on real worlds;
  - ecology vitals from `pnpm calibrate`;
  - plus anything new you noticed.
- Set "Next" to: Plan 3 (Qloo spike) once the key arrives, and Plan 5 (UI) on the fixture meanwhile.

- [ ] **Step 4: Mark Plan 2 as Done in the roadmap table**, linking `2026-10-09-plan-02-sim-ecology.md`.

- [ ] **Step 5: Commit**

```bash
git add docs/architecture.md docs/current-state.md docs/superpowers/plans/2026-10-09-roadmap.md
git commit -m "docs: record Plan 2 completion and updated architecture"
```
