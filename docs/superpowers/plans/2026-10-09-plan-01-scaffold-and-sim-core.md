# Plan 1: Scaffold + Simulation Core — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Genus Loci Next.js app and build a deterministic, tested simulation core. People agents with taste genomes go out to venues, adopt and drift tastes along affinity edges, and venues close when neglected. It runs on a synthetic World fixture.

**Architecture:** A `World` (the JSON format that the later Qloo builder will produce) is validated with zod and compiled into typed-array indexes (`CompiledWorld`: a CSR edge list and dense venue profiles). `SimState` holds every agent and venue in flat typed arrays. `step(state)` runs five sub-steps in a fixed order using a seeded RNG stored in the state. It mutates in place (use `cloneState` for snapshots), and the same seed always produces the same state hash. The sim makes no network calls and touches no DOM.

**Tech Stack:** TypeScript, Next.js (App Router, `src/` dir), pnpm, Vitest, zod, tsx.

**Spec:** [../specs/2026-10-09-genusloci-design.md](../specs/2026-10-09-genusloci-design.md), sections 7 and 12. The roadmap is [2026-10-09-roadmap.md](2026-10-09-roadmap.md).

**Rules:**
- Atomic commits in Conventional Commits format; end each message with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>` when an agent authors the commit.
- **No Qloo data in the repo:** every fixture is synthetic.

---

## File structure

| File | Responsibility |
|---|---|
| `vitest.config.ts` | Test runner config with the `@/` alias |
| `src/world/schema.ts` | `World` zod schema, types, `parseWorld` |
| `src/world/fixtures/tiny-world.ts` | Deterministic synthetic World generator (`makeTinyWorld`) |
| `src/sim/rng.ts` | Seeded RNG (mulberry32) with resumable state |
| `src/sim/world-index.ts` | `compileWorld`, `edgeWeight`, `distKm` |
| `src/sim/genome.ts` | Sparse fixed-capacity genome ops on flat typed arrays |
| `src/sim/config.ts` | `SimConfig` + `DEFAULT_CONFIG` |
| `src/sim/state.ts` | `SimState`, `initState`, `cloneState`, placement/friend helpers |
| `src/sim/steps/outing.ts` | Venue choice per agent |
| `src/sim/steps/attendance.ts` | Venue attendance tally and roster (CSR) |
| `src/sim/steps/exposure.ts` | Reinforcement + adoption |
| `src/sim/steps/drift.ts` | Mutation along affinity edges |
| `src/sim/steps/decay.ts` | Weight decay and pruning |
| `src/sim/steps/venues.ts` | Venue health and closure |
| `src/sim/step.ts` | Composes the sub-steps into one tick |
| `src/sim/hash.ts` | FNV-1a state hash for determinism checks |
| `scripts/bench-sim.ts` | Performance check (≥ 10 ticks/sec at 5,000 agents) |

Tests are colocated as `*.test.ts` next to each module.

---

### Task 1: Scaffold the Next.js app

**Files:** creates the Next.js project files at the repo root (`package.json`, `src/app/*`, `tsconfig.json`, …); modifies `.gitignore`.

- [ ] **Step 1: Scaffold into a temporary subfolder** (the repo root already contains `docs/`, `LICENSE` and `.gitignore`)

Run from the repo root:
```bash
pnpm create next-app@latest .scaffold --ts --app --src-dir --eslint --tailwind --import-alias "@/*" --use-pnpm --yes
```
Expected: `Success! Created .scaffold`. If the CLI prompts despite `--yes`, accept the defaults, but keep TypeScript, App Router, `src/`, ESLint, Tailwind and the `@/*` alias.

- [ ] **Step 2: Move the scaffold to the root, merging `.gitignore`**

```bash
cat .scaffold/.gitignore >> .gitignore
rm -rf .scaffold/.git .scaffold/.gitignore .scaffold/node_modules
cp -r .scaffold/. .
rm -rf .scaffold
pnpm install
```
If the scaffold contains a `README.md`, replace its contents with a single line: `# Genus Loci`. A real README comes in Plan 7.

- [ ] **Step 3: Verify the build**

Run: `pnpm build`
Expected: the build completes with no errors.

- [ ] **Step 4: Check that `.gitignore` still has the Qloo-data rules and the env rules**

Run: `grep -n "data/qloo\|\.env" .gitignore`
Expected: `data/qloo/` and `.env` lines are present.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "build: scaffold Next.js app with TypeScript, App Router and Tailwind"
```

---

### Task 2: Add test and runtime tooling

**Files:** create `vitest.config.ts`, `src/sim/smoke.test.ts` (deleted again in this task); modify `package.json`.

- [ ] **Step 1: Install the dependencies**

```bash
pnpm add zod
pnpm add -D vitest tsx
```

- [ ] **Step 2: Create `vitest.config.ts`**

```ts
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
```

- [ ] **Step 3: Add the scripts to `package.json`** (merge into the existing `"scripts"` object)

```json
"test": "vitest run",
"test:watch": "vitest",
"bench:sim": "tsx scripts/bench-sim.ts"
```

- [ ] **Step 4: Write a throwaway smoke test to prove the alias and runner work**

`src/sim/smoke.test.ts`:
```ts
import { describe, expect, it } from "vitest";

describe("tooling", () => {
  it("runs", () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `pnpm test`
Expected: `1 passed`.

- [ ] **Step 5: Delete the smoke test and commit**

```bash
rm src/sim/smoke.test.ts
git add package.json pnpm-lock.yaml vitest.config.ts
git commit -m "build: add vitest, zod and tsx tooling"
```

---

### Task 3: Seeded RNG

**Files:** create `src/sim/rng.ts`; test `src/sim/rng.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/rng.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { createRng } from "@/sim/rng";

describe("createRng", () => {
  it("is deterministic for a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("returns values in [0, 1)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(n) returns integers in [0, n)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });

  it("resumes exactly from state()", () => {
    const a = createRng(9);
    a.next();
    a.next();
    const resumed = createRng(a.state());
    expect(resumed.next()).toBe(a.next());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/rng.test.ts`
Expected: FAIL. The module `@/sim/rng` cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/rng.ts`:
```ts
export type Rng = {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [0, n). */
  int(n: number): number;
  /** Internal state; createRng(state()) resumes the exact sequence. */
  state(): number;
};

/** mulberry32: small, fast, deterministic PRNG. */
export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return {
    next,
    int: (n) => Math.floor(next() * n),
    state: () => s,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/rng.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/rng.ts src/sim/rng.test.ts
git commit -m "feat(sim): add seeded resumable RNG"
```

---

### Task 4: World schema

**Files:** create `src/world/schema.ts`; test `src/world/schema.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/world/schema.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { parseWorld, type World } from "@/world/schema";

const minimal = (): World => ({
  version: 1,
  city: { name: "Testville", lat: 51.5, lon: -0.1 },
  entities: [
    { id: "syn:a", name: "A", type: "artist", tags: [], popularity: 0.5 },
    { id: "syn:v", name: "V", type: "place", tags: [], popularity: 0.5, cell: 0, capacity: 10 },
  ],
  edges: [{ source: 0, target: 1, weight: 0.5 }],
  cells: [{ geohash: "gcpv", lat: 51.5, lon: -0.1, density: 1, archetypes: [{ archetype: 0, weight: 1 }] }],
  archetypes: [{ id: "arch:0", name: "Zero", genes: [{ entity: 0, weight: 1 }] }],
  heatmaps: [{ entity: 0, values: [0.7] }],
});

describe("parseWorld", () => {
  it("accepts a valid world", () => {
    expect(parseWorld(minimal()).city.name).toBe("Testville");
  });

  it("rejects an edge pointing past the entity table", () => {
    const w = minimal();
    w.edges.push({ source: 0, target: 5, weight: 0.2 });
    expect(() => parseWorld(w)).toThrow();
  });

  it("rejects a venue cell out of range", () => {
    const w = minimal();
    w.entities[1].cell = 3;
    expect(() => parseWorld(w)).toThrow();
  });

  it("rejects a cell archetype out of range", () => {
    const w = minimal();
    w.cells[0].archetypes = [{ archetype: 2, weight: 1 }];
    expect(() => parseWorld(w)).toThrow();
  });

  it("rejects a heatmap whose length differs from the cell count", () => {
    const w = minimal();
    w.heatmaps[0].values = [0.1, 0.2];
    expect(() => parseWorld(w)).toThrow();
  });

  it("rejects an unknown version", () => {
    expect(() => parseWorld({ ...minimal(), version: 2 })).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/world/schema.test.ts`
Expected: FAIL. The module `@/world/schema` cannot be resolved.

- [ ] **Step 3: Implement**

`src/world/schema.ts`:
```ts
import { z } from "zod";

/** Entity kinds. Mirrors Qloo's urn:entity:* types, plus "tag" for taste tags used as genes. */
export const ENTITY_TYPES = [
  "artist", "place", "brand", "movie", "tv_show", "book",
  "podcast", "video_game", "destination", "person", "tag",
] as const;

const index = z.number().int().nonnegative();

export const EntitySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(ENTITY_TYPES),
  tags: z.array(z.string()),
  popularity: z.number().min(0).max(1),
  /** Present for venues (type "place"): index into cells. */
  cell: index.optional(),
  /** Visitors per tick at which the venue counts as full. */
  capacity: z.number().positive().optional(),
});

export const EdgeSchema = z.object({
  source: index,
  target: index,
  /** Affinity in [0, 1]. */
  weight: z.number().min(0).max(1),
});

export const CellSchema = z.object({
  geohash: z.string(),
  lat: z.number(),
  lon: z.number(),
  /** Relative population density; drives agent placement. */
  density: z.number().nonnegative(),
  archetypes: z.array(z.object({ archetype: index, weight: z.number().nonnegative() })),
});

export const ArchetypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  genes: z.array(z.object({ entity: index, weight: z.number().min(0).max(1) })).min(1),
});

export const HeatmapSchema = z.object({
  entity: index,
  /** One affinity value per cell, same order as `cells`. */
  values: z.array(z.number()),
});

export const WorldSchema = z
  .object({
    version: z.literal(1),
    city: z.object({ name: z.string(), lat: z.number(), lon: z.number() }),
    entities: z.array(EntitySchema).min(1),
    edges: z.array(EdgeSchema),
    cells: z.array(CellSchema).min(1),
    archetypes: z.array(ArchetypeSchema).min(1),
    heatmaps: z.array(HeatmapSchema),
  })
  .superRefine((w, ctx) => {
    const nE = w.entities.length;
    const nC = w.cells.length;
    const nA = w.archetypes.length;
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    w.edges.forEach((e, i) => {
      if (e.source >= nE || e.target >= nE) fail(`edges[${i}] references a missing entity`);
    });
    w.entities.forEach((e, i) => {
      if (e.cell !== undefined && e.cell >= nC) fail(`entities[${i}].cell out of range`);
    });
    w.cells.forEach((c, i) => {
      c.archetypes.forEach((a) => {
        if (a.archetype >= nA) fail(`cells[${i}] references a missing archetype`);
      });
    });
    w.archetypes.forEach((a, i) => {
      a.genes.forEach((g) => {
        if (g.entity >= nE) fail(`archetypes[${i}] references a missing entity`);
      });
    });
    w.heatmaps.forEach((h, i) => {
      if (h.entity >= nE) fail(`heatmaps[${i}] references a missing entity`);
      if (h.values.length !== nC) fail(`heatmaps[${i}] must have one value per cell`);
    });
  });

export type World = z.infer<typeof WorldSchema>;
export type EntityType = (typeof ENTITY_TYPES)[number];

export function parseWorld(json: unknown): World {
  return WorldSchema.parse(json);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/world/schema.test.ts`
Expected: `6 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/world/schema.ts src/world/schema.test.ts
git commit -m "feat(world): add World schema with referential validation"
```

---

### Task 5: Synthetic World fixture

**Files:** create `src/world/fixtures/tiny-world.ts`; test `src/world/fixtures/tiny-world.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/world/fixtures/tiny-world.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { parseWorld } from "@/world/schema";

describe("makeTinyWorld", () => {
  it("produces a schema-valid world", () => {
    expect(() => parseWorld(makeTinyWorld())).not.toThrow();
  });

  it("is deterministic per seed", () => {
    expect(makeTinyWorld({ seed: 3 })).toEqual(makeTinyWorld({ seed: 3 }));
    expect(makeTinyWorld({ seed: 3 })).not.toEqual(makeTinyWorld({ seed: 4 }));
  });

  it("has the requested shape", () => {
    const w = makeTinyWorld({ clusters: 3, entitiesPerCluster: 12, gridSize: 4 });
    expect(w.entities).toHaveLength(36);
    expect(w.cells).toHaveLength(16);
    expect(w.archetypes).toHaveLength(3);
    expect(w.entities.filter((e) => e.type === "place")).toHaveLength(12);
  });

  it("links entities within a cluster more strongly than across clusters", () => {
    const w = makeTinyWorld();
    const per = 12;
    const cluster = (i: number) => Math.floor(i / per);
    const intra = w.edges.filter((e) => cluster(e.source) === cluster(e.target));
    const cross = w.edges.filter((e) => cluster(e.source) !== cluster(e.target));
    const min = Math.min(...intra.map((e) => e.weight));
    const max = Math.max(...cross.map((e) => e.weight));
    expect(min).toBeGreaterThan(max);
  });

  it("uses only synthetic ids", () => {
    expect(makeTinyWorld().entities.every((e) => e.id.startsWith("syn:"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/world/fixtures/tiny-world.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/world/fixtures/tiny-world.ts`:
```ts
import { createRng } from "@/sim/rng";
import type { World } from "@/world/schema";

/**
 * Deterministic synthetic World for tests and benchmarks.
 * Synthetic data only: Qloo responses must never be committed (Qloo terms).
 *
 * Shape: `clusters` taste clusters ("genres"), each with `entitiesPerCluster`
 * entities. The first 4 of each cluster are venues, the rest artists. The grid
 * is gridSize × gridSize cells; each column is dominated by one cluster's archetype.
 */
export function makeTinyWorld(
  opts: { seed?: number; clusters?: number; entitiesPerCluster?: number; gridSize?: number } = {},
): World {
  const { seed = 1, clusters = 3, entitiesPerCluster = 12, gridSize = 4 } = opts;
  const rng = createRng(seed);
  const nCells = gridSize * gridSize;
  const idx = (c: number, j: number) => c * entitiesPerCluster + j;
  const VENUES_PER_CLUSTER = 4;

  const entities: World["entities"] = [];
  for (let c = 0; c < clusters; c++) {
    for (let j = 0; j < entitiesPerCluster; j++) {
      const isVenue = j < VENUES_PER_CLUSTER;
      entities.push({
        id: `syn:${c}:${j}`,
        name: `Cluster ${c} ${isVenue ? "Venue" : "Artist"} ${j}`,
        type: isVenue ? "place" : "artist",
        tags: [`syn:genre:${c}`],
        popularity: rng.next(),
        ...(isVenue ? { cell: rng.int(nCells), capacity: 50 } : {}),
      });
    }
  }

  const edges: World["edges"] = [];
  for (let c = 0; c < clusters; c++) {
    for (let j = 0; j < entitiesPerCluster; j++) {
      for (let k = 0; k < entitiesPerCluster; k++) {
        if (j !== k) edges.push({ source: idx(c, j), target: idx(c, k), weight: 0.5 + 0.5 * rng.next() });
      }
      if (clusters > 1) {
        const other = (c + 1 + rng.int(clusters - 1)) % clusters;
        edges.push({ source: idx(c, j), target: idx(other, rng.int(entitiesPerCluster)), weight: 0.05 + 0.1 * rng.next() });
      }
    }
  }

  const cells: World["cells"] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const dominant = col % clusters;
      const archetypes = [{ archetype: dominant, weight: 0.8 }];
      if (clusters > 1) archetypes.push({ archetype: (col + 1) % clusters, weight: 0.2 });
      cells.push({
        geohash: `syn${row}${col}`,
        lat: 51.5 + row * 0.01,
        lon: -0.1 + col * 0.01,
        density: 1 + rng.next(),
        archetypes,
      });
    }
  }

  const archetypes: World["archetypes"] = [];
  for (let c = 0; c < clusters; c++) {
    const genes: World["archetypes"][number]["genes"] = [];
    for (let j = VENUES_PER_CLUSTER; j < entitiesPerCluster; j++) {
      genes.push({ entity: idx(c, j), weight: 0.6 + 0.4 * rng.next() });
    }
    archetypes.push({ id: `syn:arch:${c}`, name: `Synthetic scene ${c}`, genes });
  }

  const heatmaps: World["heatmaps"] = [];
  for (let c = 0; c < clusters; c++) {
    heatmaps.push({
      entity: idx(c, VENUES_PER_CLUSTER),
      values: cells.map((cell) => cell.archetypes.find((a) => a.archetype === c)?.weight ?? 0),
    });
  }

  return { version: 1, city: { name: "Synthville", lat: 51.5, lon: -0.1 }, entities, edges, cells, archetypes, heatmaps };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/world/fixtures/tiny-world.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/world/fixtures
git commit -m "test(world): add deterministic synthetic world fixture"
```

---

### Task 6: Compiled world index

**Files:** create `src/sim/world-index.ts`; test `src/sim/world-index.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/world-index.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { compileWorld, distKm, edgeWeight } from "@/sim/world-index";
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

  it("indexes venues with cell and capacity", () => {
    expect(Array.from(cw.venues)).toEqual([2]);
    expect(cw.venueCell[0]).toBe(1);
    expect(cw.venueCapacity[0]).toBe(20);
  });

  it("builds the venue profile: 1 for itself, edge weight for neighbours", () => {
    expect(cw.venueProfile[0 * cw.nEntities + 2]).toBe(1);
    expect(cw.venueProfile[0 * cw.nEntities + 0]).toBeCloseTo(0.4);
    expect(cw.venueProfile[0 * cw.nEntities + 1]).toBe(0);
  });

  it("lists nearby venues per cell", () => {
    expect(Array.from(cw.nearbyVenues[0])).toEqual([0]);
    expect(Array.from(cw.nearbyVenues[1])).toEqual([0]);
  });

  it("computes distance in km", () => {
    expect(distKm(cw, 0, 0)).toBe(0);
    expect(distKm(cw, 0, 1)).toBeCloseTo(11.1, 0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/world-index.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/world-index.ts`:
```ts
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
    if (e.source === e.target) continue;
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/world-index.test.ts`
Expected: `5 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/world-index.ts src/sim/world-index.test.ts
git commit -m "feat(sim): compile World into CSR edges and venue indexes"
```

---

### Task 7: Genome operations

**Files:** create `src/sim/genome.ts`; test `src/sim/genome.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/genome.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  GENOME_CAP, addGene, affinityToEntity, createGenomes, decayGenome,
  geneSlot, genomeSimilarity, topGene, venueAffinity,
} from "@/sim/genome";
import { compileWorld } from "@/sim/world-index";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const cw = compileWorld(makeTinyWorld());
const PER = 12;
const idx = (c: number, j: number) => c * PER + j;

describe("genome", () => {
  it("adds, reinforces and caps weights at 1", () => {
    const g = createGenomes(1);
    addGene(g, 0, 5, 0.4);
    addGene(g, 0, 5, 0.9);
    expect(g.w[geneSlot(g, 0, 5)]).toBe(1);
  });

  it("replaces the weakest gene when full, only if the newcomer is stronger", () => {
    const g = createGenomes(1);
    for (let k = 0; k < GENOME_CAP; k++) addGene(g, 0, 100 + k, 0.5);
    addGene(g, 0, 100, 0.0); // no-op reinforce
    g.w[geneSlot(g, 0, 107)] = 0.1;
    addGene(g, 0, 999, 0.05);
    expect(geneSlot(g, 0, 999)).toBe(-1);
    addGene(g, 0, 999, 0.3);
    expect(geneSlot(g, 0, 999)).toBeGreaterThanOrEqual(0);
    expect(geneSlot(g, 0, 107)).toBe(-1);
  });

  it("decays and prunes", () => {
    const g = createGenomes(1);
    addGene(g, 0, 1, 0.5);
    addGene(g, 0, 2, 0.021);
    decayGenome(g, 0, 0.1, 0.02);
    expect(g.w[geneSlot(g, 0, 1)]).toBeCloseTo(0.45);
    expect(geneSlot(g, 0, 2)).toBe(-1);
  });

  it("scores affinity higher for linked entities", () => {
    const g = createGenomes(1);
    addGene(g, 0, idx(0, 4), 1);
    const same = affinityToEntity(g, 0, cw, idx(0, 5));
    const other = affinityToEntity(g, 0, cw, idx(1, 5));
    expect(same).toBeGreaterThan(0.4);
    expect(same).toBeGreaterThan(other);
    expect(affinityToEntity(g, 0, cw, idx(0, 4))).toBe(1);
  });

  it("returns 0 affinity for an empty genome", () => {
    expect(affinityToEntity(createGenomes(1), 0, cw, 0)).toBe(0);
  });

  it("scores venue affinity higher for same-cluster venues", () => {
    const g = createGenomes(1);
    addGene(g, 0, idx(0, 5), 1);
    addGene(g, 0, idx(0, 6), 1);
    const venueOfCluster = (c: number) => Array.from(cw.venues).indexOf(idx(c, 0));
    expect(venueAffinity(g, 0, cw, venueOfCluster(0))).toBeGreaterThan(
      venueAffinity(g, 0, cw, venueOfCluster(1)),
    );
  });

  it("computes cosine similarity and the top gene", () => {
    const g = createGenomes(3);
    addGene(g, 0, 1, 1); addGene(g, 0, 2, 0.5);
    addGene(g, 1, 1, 1); addGene(g, 1, 2, 0.5);
    addGene(g, 2, 9, 1);
    expect(genomeSimilarity(g, 0, 1)).toBeCloseTo(1);
    expect(genomeSimilarity(g, 0, 2)).toBe(0);
    expect(topGene(g, 0)).toBe(1);
    expect(topGene(createGenomes(1), 0)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/genome.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/genome.ts`:
```ts
import { type CompiledWorld, edgeWeight } from "@/sim/world-index";

/** Max genes per agent. Slots with id -1 are empty. */
export const GENOME_CAP = 32;

/** All agents' genomes in flat arrays: agent a owns slots [a*CAP, (a+1)*CAP). */
export type Genomes = { ids: Int32Array; w: Float32Array };

export function createGenomes(nAgents: number): Genomes {
  return {
    ids: new Int32Array(nAgents * GENOME_CAP).fill(-1),
    w: new Float32Array(nAgents * GENOME_CAP),
  };
}

export function cloneGenomes(g: Genomes): Genomes {
  return { ids: g.ids.slice(), w: g.w.slice() };
}

/** Slot index holding `entity` for `agent`, or -1. */
export function geneSlot(g: Genomes, agent: number, entity: number): number {
  const base = agent * GENOME_CAP;
  for (let k = 0; k < GENOME_CAP; k++) if (g.ids[base + k] === entity) return base + k;
  return -1;
}

/** Reinforce an existing gene, fill an empty slot, or replace the weakest gene if `weight` beats it. */
export function addGene(g: Genomes, agent: number, entity: number, weight: number): void {
  const base = agent * GENOME_CAP;
  let empty = -1;
  let weakest = -1;
  let weakestW = Infinity;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = base + k;
    const id = g.ids[slot];
    if (id === entity) {
      g.w[slot] = Math.min(1, g.w[slot] + weight);
      return;
    }
    if (id === -1) {
      if (empty === -1) empty = slot;
    } else if (g.w[slot] < weakestW) {
      weakestW = g.w[slot];
      weakest = slot;
    }
  }
  const target = empty !== -1 ? empty : weight > weakestW ? weakest : -1;
  if (target === -1) return;
  g.ids[target] = entity;
  g.w[target] = Math.min(1, weight);
}

export function decayGenome(g: Genomes, agent: number, rate: number, minWeight: number): void {
  const base = agent * GENOME_CAP;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = base + k;
    if (g.ids[slot] === -1) continue;
    g.w[slot] *= 1 - rate;
    if (g.w[slot] < minWeight) {
      g.ids[slot] = -1;
      g.w[slot] = 0;
    }
  }
}

/** Weighted mean link strength from the genome to `entity`, in [0, 1]. */
export function affinityToEntity(g: Genomes, agent: number, cw: CompiledWorld, entity: number): number {
  const base = agent * GENOME_CAP;
  let num = 0;
  let den = 0;
  for (let k = 0; k < GENOME_CAP; k++) {
    const id = g.ids[base + k];
    if (id === -1) continue;
    const w = g.w[base + k];
    den += w;
    num += w * (id === entity ? 1 : edgeWeight(cw, id, entity));
  }
  return den > 0 ? num / den : 0;
}

/** Weighted mean of the venue's profile over the genome, in [0, 1]. */
export function venueAffinity(g: Genomes, agent: number, cw: CompiledWorld, venue: number): number {
  const base = agent * GENOME_CAP;
  const row = venue * cw.nEntities;
  let num = 0;
  let den = 0;
  for (let k = 0; k < GENOME_CAP; k++) {
    const id = g.ids[base + k];
    if (id === -1) continue;
    const w = g.w[base + k];
    den += w;
    num += w * cw.venueProfile[row + id];
  }
  return den > 0 ? num / den : 0;
}

/** Cosine similarity of two agents' sparse genomes. */
export function genomeSimilarity(g: Genomes, a: number, b: number): number {
  const ba = a * GENOME_CAP;
  const bb = b * GENOME_CAP;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < GENOME_CAP; i++) {
    const wa = g.w[ba + i];
    const wb = g.w[bb + i];
    if (g.ids[ba + i] !== -1) na += wa * wa;
    if (g.ids[bb + i] !== -1) nb += wb * wb;
    const id = g.ids[ba + i];
    if (id === -1) continue;
    for (let j = 0; j < GENOME_CAP; j++) {
      if (g.ids[bb + j] === id) {
        dot += wa * g.w[bb + j];
        break;
      }
    }
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/** Entity with the highest weight, or -1 for an empty genome. */
export function topGene(g: Genomes, agent: number): number {
  const base = agent * GENOME_CAP;
  let best = -1;
  let bestW = -1;
  for (let k = 0; k < GENOME_CAP; k++) {
    if (g.ids[base + k] !== -1 && g.w[base + k] > bestW) {
      bestW = g.w[base + k];
      best = g.ids[base + k];
    }
  }
  return best;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/genome.test.ts`
Expected: `7 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/genome.ts src/sim/genome.test.ts
git commit -m "feat(sim): add sparse fixed-capacity genome operations"
```

---

### Task 8: Config and initial state

**Files:** create `src/sim/config.ts`, `src/sim/state.ts`; test `src/sim/state.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/state.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { GENOME_CAP } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { allocateAgentsToCells, cloneState, initState, pickWeighted } from "@/sim/state";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { ...DEFAULT_CONFIG, nAgents: 300 };

describe("allocateAgentsToCells", () => {
  it("distributes exactly n agents in proportion to density", () => {
    const cells = allocateAgentsToCells([1, 3, 0], 8);
    expect(cells).toHaveLength(8);
    const counts = [0, 0, 0];
    cells.forEach((c) => counts[c]++);
    expect(counts).toEqual([2, 6, 0]);
  });

  it("falls back to uniform when all densities are 0", () => {
    const counts = [0, 0];
    allocateAgentsToCells([0, 0], 4).forEach((c) => counts[c]++);
    expect(counts).toEqual([2, 2]);
  });
});

describe("pickWeighted", () => {
  it("never picks a zero weight and returns -1 when all are zero", () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(pickWeighted([0, 1, 0], rng)).toBe(1);
    expect(pickWeighted([0, 0], rng)).toBe(-1);
  });
});

describe("initState", () => {
  const world = makeTinyWorld();
  const s = initState(world, config, 5);

  it("creates nAgents with valid home cells", () => {
    expect(s.homeCell).toHaveLength(300);
    expect(Math.max(...s.homeCell)).toBeLessThan(world.cells.length);
  });

  it("gives every agent a non-empty genome of world entities", () => {
    for (let i = 0; i < 300; i++) {
      const ids = Array.from(s.genomes.ids.subarray(i * GENOME_CAP, (i + 1) * GENOME_CAP)).filter((x) => x >= 0);
      expect(ids.length).toBeGreaterThan(0);
      expect(Math.max(...ids)).toBeLessThan(world.entities.length);
    }
  });

  it("gives friends that are other valid agents, with no duplicates", () => {
    const F = config.friendsPerAgent;
    for (let i = 0; i < 300; i++) {
      const fr = Array.from(s.friends.subarray(i * F, (i + 1) * F)).filter((x) => x >= 0);
      expect(fr).not.toContain(i);
      expect(new Set(fr).size).toBe(fr.length);
      fr.forEach((f) => expect(f).toBeLessThan(300));
    }
  });

  it("starts with all venues open and nobody out", () => {
    expect(s.tick).toBe(0);
    expect(Array.from(s.venueOpen).every((x) => x === 1)).toBe(true);
    expect(Array.from(s.attendance).every((x) => x === -1)).toBe(true);
  });

  it("clones deeply (mutating the clone leaves the original intact)", () => {
    const c = cloneState(s);
    c.genomes.w[0] = 0.123;
    c.venueOpen[0] = 0;
    expect(s.genomes.w[0]).not.toBe(0.123);
    expect(s.venueOpen[0]).toBe(1);
    expect(c.cw).toBe(s.cw);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/state.test.ts`
Expected: FAIL. The modules cannot be resolved.

- [ ] **Step 3: Implement the config**

`src/sim/config.ts`:
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
};
```

- [ ] **Step 4: Implement the state**

`src/sim/state.ts`:
```ts
import { DEFAULT_CONFIG, type SimConfig } from "@/sim/config";
import { addGene, cloneGenomes, createGenomes, type Genomes, genomeSimilarity } from "@/sim/genome";
import { createRng, type Rng } from "@/sim/rng";
import { type CompiledWorld, compileWorld } from "@/sim/world-index";
import type { World } from "@/world/schema";

const FRIEND_CANDIDATES = 24;
const SAME_CELL_FRIEND_P = 0.7;

export type SimState = {
  tick: number;
  rngState: number;
  config: SimConfig;
  /** Shared and immutable; never cloned. */
  cw: CompiledWorld;
  homeCell: Int32Array;
  energy: Float32Array;
  curiosity: Float32Array;
  /** nAgents × friendsPerAgent; -1 = empty. */
  friends: Int32Array;
  genomes: Genomes;
  /** Venue slot attended in the last tick, or -1. */
  attendance: Int32Array;
  venueOpen: Uint8Array;
  venueHealth: Float32Array;
  venueLowTicks: Int32Array;
  /** Visitors per venue in the last tick. */
  venueAttendance: Int32Array;
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

function seedGenome(g: Genomes, agent: number, archetype: World["archetypes"][number], count: number, rng: Rng) {
  const ws = archetype.genes.map((x) => x.weight);
  for (let n = 0; n < count; n++) {
    const k = pickWeighted(ws, rng);
    if (k === -1) break;
    addGene(g, agent, archetype.genes[k].entity, archetype.genes[k].weight * (0.5 + 0.5 * rng.next()));
    ws[k] = 0;
  }
}

function buildFriends(homeCell: Int32Array, genomes: Genomes, nCells: number, F: number, rng: Rng): Int32Array {
  const n = homeCell.length;
  const byCell: number[][] = Array.from({ length: nCells }, () => []);
  for (let i = 0; i < n; i++) byCell[homeCell[i]].push(i);
  const friends = new Int32Array(n * F).fill(-1);
  for (let i = 0; i < n; i++) {
    const seen = new Set<number>();
    const scored: { c: number; sim: number }[] = [];
    for (let s = 0; s < FRIEND_CANDIDATES; s++) {
      const cell = rng.next() < SAME_CELL_FRIEND_P ? homeCell[i] : rng.int(nCells);
      const list = byCell[cell];
      if (list.length === 0) continue;
      const c = list[rng.int(list.length)];
      if (c === i || seen.has(c)) continue;
      seen.add(c);
      scored.push({ c, sim: genomeSimilarity(genomes, i, c) });
    }
    scored.sort((a, b) => b.sim - a.sim || a.c - b.c);
    scored.slice(0, F).forEach((x, k) => {
      friends[i * F + k] = x.c;
    });
  }
  return friends;
}

export function initState(world: World, config: SimConfig = DEFAULT_CONFIG, seed = 1): SimState {
  const cw = compileWorld(world, config.maxNearby);
  const rng = createRng(seed);
  const n = config.nAgents;
  const homeCell = allocateAgentsToCells(world.cells.map((c) => c.density), n);
  const genomes = createGenomes(n);
  const energy = new Float32Array(n);
  const curiosity = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const cell = world.cells[homeCell[i]];
    const k = pickWeighted(cell.archetypes.map((a) => a.weight), rng);
    const archetype = k === -1 ? rng.int(world.archetypes.length) : cell.archetypes[k].archetype;
    seedGenome(genomes, i, world.archetypes[archetype], config.initialGenes, rng);
    energy[i] = 0.5 + 0.5 * rng.next();
    curiosity[i] = rng.next();
  }

  const friends = buildFriends(homeCell, genomes, world.cells.length, config.friendsPerAgent, rng);
  const nV = cw.venues.length;

  return {
    tick: 0,
    rngState: rng.state(),
    config,
    cw,
    homeCell,
    energy,
    curiosity,
    friends,
    genomes,
    attendance: new Int32Array(n).fill(-1),
    venueOpen: new Uint8Array(nV).fill(1),
    venueHealth: new Float32Array(nV).fill(0.5),
    venueLowTicks: new Int32Array(nV),
    venueAttendance: new Int32Array(nV),
  };
}

/** Deep copy of all mutable state (the compiled world is shared). */
export function cloneState(s: SimState): SimState {
  return {
    ...s,
    config: { ...s.config },
    homeCell: s.homeCell.slice(),
    energy: s.energy.slice(),
    curiosity: s.curiosity.slice(),
    friends: s.friends.slice(),
    genomes: cloneGenomes(s.genomes),
    attendance: s.attendance.slice(),
    venueOpen: s.venueOpen.slice(),
    venueHealth: s.venueHealth.slice(),
    venueLowTicks: s.venueLowTicks.slice(),
    venueAttendance: s.venueAttendance.slice(),
  };
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test src/sim/state.test.ts`
Expected: `8 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/sim/config.ts src/sim/state.ts src/sim/state.test.ts
git commit -m "feat(sim): initialise agents from archetypes with friends and venue state"
```

---

### Task 9: Outing step (venue choice)

**Files:** create `src/sim/steps/outing.ts`; test `src/sim/steps/outing.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/steps/outing.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { chooseOutings } from "@/sim/steps/outing";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();

describe("chooseOutings", () => {
  it("sends nobody out when outingRate is 0", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 200, outingRate: 0 }, 1);
    chooseOutings(s, createRng(1));
    expect(Array.from(s.attendance).every((v) => v === -1)).toBe(true);
  });

  it("sends agents only to valid, open venues", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 200, outingRate: 1 }, 1);
    chooseOutings(s, createRng(1));
    const out = Array.from(s.attendance).filter((v) => v >= 0);
    expect(out.length).toBeGreaterThan(50);
    out.forEach((v) => expect(v).toBeLessThan(s.cw.venues.length));
  });

  it("never picks a closed venue", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 200, outingRate: 1 }, 1);
    s.venueOpen.fill(0);
    s.venueOpen[3] = 1;
    chooseOutings(s, createRng(2));
    Array.from(s.attendance).forEach((v) => expect([-1, 3]).toContain(v));
  });

  it("prefers venues matching the agent's taste cluster", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 600, outingRate: 1, distPenaltyPerKm: 0 }, 3);
    chooseOutings(s, createRng(3));
    const clusterOfEntity = (e: number) => Math.floor(e / 12);
    let match = 0;
    let total = 0;
    for (let i = 0; i < 600; i++) {
      const v = s.attendance[i];
      if (v < 0) continue;
      const topId = s.genomes.ids[i * 32];
      if (topId < 0) continue;
      total++;
      if (clusterOfEntity(s.cw.venues[v]) === clusterOfEntity(topId)) match++;
    }
    expect(match / total).toBeGreaterThan(0.5);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/steps/outing.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/steps/outing.ts`:
```ts
import { venueAffinity } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";
import { distKm } from "@/sim/world-index";

/**
 * Each agent may go out and picks a venue by softmax over taste affinity, distance and friends.
 * Candidates are open nearby venues plus venues friends attended last tick.
 * Writes the new s.attendance (friend lookups use the previous tick's attendance).
 */
export function chooseOutings(s: SimState, rng: Rng): void {
  const { cw, config, genomes } = s;
  const n = s.homeCell.length;
  const F = config.friendsPerAgent;
  const prev = s.attendance;
  const next = new Int32Array(n).fill(-1);
  const cand = new Int32Array(config.maxNearby + F);
  const scores = new Float64Array(cand.length);

  for (let i = 0; i < n; i++) {
    if (rng.next() >= config.outingRate * s.energy[i]) continue;
    const home = s.homeCell[i];

    let m = 0;
    for (const v of cw.nearbyVenues[home]) if (s.venueOpen[v]) cand[m++] = v;
    for (let f = 0; f < F; f++) {
      const friend = s.friends[i * F + f];
      if (friend < 0) continue;
      const fv = prev[friend];
      if (fv < 0 || !s.venueOpen[fv]) continue;
      let dup = false;
      for (let j = 0; j < m; j++) if (cand[j] === fv) dup = true;
      if (!dup) cand[m++] = fv;
    }
    if (m === 0) continue;

    let total = 0;
    for (let j = 0; j < m; j++) {
      const v = cand[j];
      let friendsThere = 0;
      for (let f = 0; f < F; f++) {
        const friend = s.friends[i * F + f];
        if (friend >= 0 && prev[friend] === v) friendsThere++;
      }
      const score = Math.exp(
        config.beta * venueAffinity(genomes, i, cw, v) -
          config.distPenaltyPerKm * distKm(cw, home, cw.venueCell[v]) +
          config.friendBonus * (friendsThere / F),
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

Note: the "prefers venues matching taste" test reads slot 0 as a proxy for the agent's main cluster. That holds because `seedGenome` fills slots from the agent's single archetype, so every initial gene comes from one cluster.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/steps/outing.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/steps/outing.ts src/sim/steps/outing.test.ts
git commit -m "feat(sim): add taste/distance/friend-weighted venue choice"
```

---

### Task 10: Attendance tally + exposure/adoption step

**Files:** create `src/sim/steps/attendance.ts`, `src/sim/steps/exposure.ts`; test `src/sim/steps/exposure.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/steps/exposure.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { GENOME_CAP, addGene, geneSlot } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { tallyAttendance } from "@/sim/steps/attendance";
import { adoptionProbability, applyExposure } from "@/sim/steps/exposure";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const idx = (c: number, j: number) => c * 12 + j;
const clearAgent = (s: ReturnType<typeof initState>, a: number) => {
  s.genomes.ids.fill(-1, a * GENOME_CAP, (a + 1) * GENOME_CAP);
  s.genomes.w.fill(0, a * GENOME_CAP, (a + 1) * GENOME_CAP);
  s.friends.fill(-1, a * s.config.friendsPerAgent, (a + 1) * s.config.friendsPerAgent);
};

describe("tallyAttendance", () => {
  it("counts visitors and groups them by venue", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 6 }, 1);
    s.attendance = Int32Array.from([0, 2, 0, -1, 2, 2]);
    const roster = tallyAttendance(s);
    expect(s.venueAttendance[0]).toBe(2);
    expect(s.venueAttendance[2]).toBe(3);
    const at = (v: number) => Array.from(roster.members.subarray(roster.offsets[v], roster.offsets[v + 1]));
    expect(at(0)).toEqual([0, 2]);
    expect(at(2)).toEqual([1, 4, 5]);
  });
});

describe("adoptionProbability", () => {
  it("is higher for entities linked to the genome", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 50 }, 1);
    clearAgent(s, 0);
    addGene(s.genomes, 0, idx(0, 4), 1);
    const same = adoptionProbability(s, 0, idx(0, 5));
    const other = adoptionProbability(s, 0, idx(1, 5));
    expect(same).toBeGreaterThan(0);
    expect(same).toBeGreaterThan(other);
  });

  it("rises when friends hold the entity", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 50 }, 1);
    clearAgent(s, 0);
    addGene(s.genomes, 0, idx(0, 4), 1);
    const before = adoptionProbability(s, 0, idx(1, 5));
    s.friends[0] = 1;
    addGene(s.genomes, 1, idx(1, 5), 1);
    expect(adoptionProbability(s, 0, idx(1, 5))).toBeGreaterThan(before);
  });
});

describe("applyExposure", () => {
  it("reinforces genes shared with the attended venue", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 2 }, 1);
    clearAgent(s, 0);
    clearAgent(s, 1);
    const venue = Array.from(s.cw.venues).indexOf(idx(0, 0));
    addGene(s.genomes, 0, idx(0, 5), 0.5);
    s.attendance = Int32Array.from([venue, -1]);
    applyExposure(s, createRng(1), tallyAttendance(s));
    expect(s.genomes.w[geneSlot(s.genomes, 0, idx(0, 5))]).toBeGreaterThan(0.5);
  });

  it("lets attendees adopt the venue itself over repeated visits", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 2, adoptBase: 1 }, 1);
    clearAgent(s, 0);
    clearAgent(s, 1);
    const venue = Array.from(s.cw.venues).indexOf(idx(0, 0));
    addGene(s.genomes, 0, idx(0, 5), 1);
    const rng = createRng(4);
    for (let t = 0; t < 20; t++) {
      s.attendance = Int32Array.from([venue, -1]);
      applyExposure(s, rng, tallyAttendance(s));
    }
    expect(geneSlot(s.genomes, 0, idx(0, 0))).toBeGreaterThanOrEqual(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/steps/exposure.test.ts`
Expected: FAIL. The modules cannot be resolved.

- [ ] **Step 3: Implement attendance**

`src/sim/steps/attendance.ts`:
```ts
import type { SimState } from "@/sim/state";

/** Attendees grouped by venue: venue v's agents are members[offsets[v]..offsets[v+1]). */
export type Roster = { offsets: Int32Array; members: Int32Array };

/** Sets s.venueAttendance from s.attendance and returns the attendee roster. */
export function tallyAttendance(s: SimState): Roster {
  const nV = s.cw.venues.length;
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

- [ ] **Step 4: Implement exposure**

`src/sim/steps/exposure.ts`:
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
 * (1) the venue itself and (2) a random co-attendee's strongest gene.
 */
export function applyExposure(s: SimState, rng: Rng, roster: Roster): void {
  const { cw, config, genomes } = s;
  for (let i = 0; i < s.attendance.length; i++) {
    const v = s.attendance[i];
    if (v < 0) continue;

    const base = i * GENOME_CAP;
    const row = v * cw.nEntities;
    for (let k = 0; k < GENOME_CAP; k++) {
      const id = genomes.ids[base + k];
      if (id < 0) continue;
      const p = cw.venueProfile[row + id];
      if (p > 0) genomes.w[base + k] = Math.min(1, genomes.w[base + k] + config.reinforce * p);
    }

    tryAdopt(s, i, cw.venues[v], rng);

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

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test src/sim/steps/exposure.test.ts`
Expected: `5 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/sim/steps/attendance.ts src/sim/steps/exposure.ts src/sim/steps/exposure.test.ts
git commit -m "feat(sim): add attendance roster, venue reinforcement and affinity-driven adoption"
```

---

### Task 11: Drift and decay steps

**Files:** create `src/sim/steps/drift.ts`, `src/sim/steps/decay.ts`; test `src/sim/steps/drift-decay.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/steps/drift-decay.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { GENOME_CAP, addGene, geneSlot } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { applyDecay } from "@/sim/steps/decay";
import { applyDrift } from "@/sim/steps/drift";
import { edgeWeight } from "@/sim/world-index";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const genesOf = (s: ReturnType<typeof initState>, a: number) =>
  Array.from(s.genomes.ids.subarray(a * GENOME_CAP, (a + 1) * GENOME_CAP)).filter((x) => x >= 0);

describe("applyDrift", () => {
  it("adds a graph neighbour of an existing gene", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 1, driftRate: 1 }, 1);
    s.genomes.ids.fill(-1);
    s.genomes.w.fill(0);
    addGene(s.genomes, 0, 5, 1);
    s.curiosity[0] = 1;
    applyDrift(s, createRng(1));
    const added = genesOf(s, 0).filter((e) => e !== 5);
    expect(added).toHaveLength(1);
    expect(edgeWeight(s.cw, 5, added[0])).toBeGreaterThan(0);
  });

  it("does nothing when driftRate is 0", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 20, driftRate: 0 }, 1);
    const before = s.genomes.ids.slice();
    applyDrift(s, createRng(1));
    expect(s.genomes.ids).toEqual(before);
  });
});

describe("applyDecay", () => {
  it("weakens all genes and prunes tiny ones", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 1, decayRate: 0.5, minWeight: 0.1 }, 1);
    s.genomes.ids.fill(-1);
    s.genomes.w.fill(0);
    addGene(s.genomes, 0, 1, 0.8);
    addGene(s.genomes, 0, 2, 0.15);
    applyDecay(s);
    expect(s.genomes.w[geneSlot(s.genomes, 0, 1)]).toBeCloseTo(0.4);
    expect(geneSlot(s.genomes, 0, 2)).toBe(-1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/steps/drift-decay.test.ts`
Expected: FAIL. The modules cannot be resolved.

- [ ] **Step 3: Implement drift**

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
  for (let i = 0; i < s.homeCell.length; i++) {
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

- [ ] **Step 4: Implement decay**

`src/sim/steps/decay.ts`:
```ts
import { decayGenome } from "@/sim/genome";
import type { SimState } from "@/sim/state";

/** Unreinforced tastes fade; genes below minWeight are forgotten. */
export function applyDecay(s: SimState): void {
  const { decayRate, minWeight } = s.config;
  for (let i = 0; i < s.homeCell.length; i++) decayGenome(s.genomes, i, decayRate, minWeight);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test src/sim/steps/drift-decay.test.ts`
Expected: `3 passed`.

- [ ] **Step 6: Commit**

```bash
git add src/sim/steps/drift.ts src/sim/steps/decay.ts src/sim/steps/drift-decay.test.ts
git commit -m "feat(sim): add taste drift along affinity edges and genome decay"
```

---

### Task 12: Venue lifecycle step

**Files:** create `src/sim/steps/venues.ts`; test `src/sim/steps/venues.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/steps/venues.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { updateVenues } from "@/sim/steps/venues";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { ...DEFAULT_CONFIG, nAgents: 10, healthAlpha: 0.5, closeThreshold: 0.2, closeAfterTicks: 2, graceTicks: 1 };

describe("updateVenues", () => {
  it("moves health toward occupancy (capped at 1)", () => {
    const s = initState(makeTinyWorld(), config, 1);
    s.venueAttendance[0] = 1000;
    updateVenues(s);
    expect(s.venueHealth[0]).toBeCloseTo(0.75);
  });

  it("closes a neglected venue after closeAfterTicks low ticks, but not during grace", () => {
    const s = initState(makeTinyWorld(), config, 1);
    s.venueAttendance.fill(0);
    s.tick = 0;
    updateVenues(s);
    updateVenues(s);
    expect(s.venueOpen[0]).toBe(1);
    s.tick = 5;
    updateVenues(s);
    updateVenues(s);
    expect(s.venueOpen[0]).toBe(0);
  });

  it("resets the low-tick counter when health recovers", () => {
    const s = initState(makeTinyWorld(), config, 1);
    s.tick = 5;
    s.venueHealth[0] = 0.1;
    s.venueAttendance[0] = 0;
    updateVenues(s);
    expect(s.venueLowTicks[0]).toBe(1);
    s.venueAttendance[0] = 1000;
    updateVenues(s);
    expect(s.venueLowTicks[0]).toBe(0);
    expect(s.venueOpen[0]).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/steps/venues.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/steps/venues.ts`:
```ts
import type { SimState } from "@/sim/state";

/**
 * Venue ecology: health is an EMA of occupancy (attendance / capacity, capped at 1).
 * After the grace period, a venue below closeThreshold for closeAfterTicks consecutive ticks closes.
 */
export function updateVenues(s: SimState): void {
  const { healthAlpha, closeThreshold, closeAfterTicks, graceTicks } = s.config;
  for (let v = 0; v < s.cw.venues.length; v++) {
    if (!s.venueOpen[v]) continue;
    const occupancy = Math.min(1, s.venueAttendance[v] / s.cw.venueCapacity[v]);
    s.venueHealth[v] = (1 - healthAlpha) * s.venueHealth[v] + healthAlpha * occupancy;
    if (s.tick >= graceTicks && s.venueHealth[v] < closeThreshold) s.venueLowTicks[v]++;
    else s.venueLowTicks[v] = 0;
    if (s.venueLowTicks[v] >= closeAfterTicks) s.venueOpen[v] = 0;
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/steps/venues.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/steps/venues.ts src/sim/steps/venues.test.ts
git commit -m "feat(sim): add venue health and closure lifecycle"
```

---

### Task 13: Tick composition + determinism hash

**Files:** create `src/sim/step.ts`, `src/sim/hash.ts`; test `src/sim/step.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/step.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { hashState } from "@/sim/hash";
import { cloneState, initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { ...DEFAULT_CONFIG, nAgents: 400 };
const run = (seed: number, ticks: number) => {
  const s = initState(makeTinyWorld(), config, seed);
  for (let t = 0; t < ticks; t++) step(s);
  return s;
};

describe("step", () => {
  it("advances the tick and the rng state", () => {
    const s = initState(makeTinyWorld(), config, 1);
    const rng0 = s.rngState;
    step(s);
    expect(s.tick).toBe(1);
    expect(s.rngState).not.toBe(rng0);
  });

  it("is deterministic: same seed gives the same hash", () => {
    expect(hashState(run(11, 15))).toBe(hashState(run(11, 15)));
  });

  it("differs across seeds", () => {
    expect(hashState(run(11, 15))).not.toBe(hashState(run(12, 15)));
  });

  it("continues identically from a clone", () => {
    const a = run(5, 5);
    const b = cloneState(a);
    for (let t = 0; t < 5; t++) {
      step(a);
      step(b);
    }
    expect(hashState(a)).toBe(hashState(b));
  });

  it("closes a venue nobody can fill", () => {
    const world = makeTinyWorld();
    const venueEntity = world.entities.findIndex((e) => e.type === "place");
    world.entities[venueEntity].capacity = 1e9;
    const s = initState(world, config, 2);
    for (let t = 0; t < 40; t++) step(s);
    const slot = Array.from(s.cw.venues).indexOf(venueEntity);
    expect(s.venueOpen[slot]).toBe(0);
  });

  it("keeps the population alive: agents still go out and still have tastes after 50 ticks", () => {
    const s = run(9, 50);
    expect(Array.from(s.attendance).filter((v) => v >= 0).length).toBeGreaterThan(50);
    expect(Array.from(s.genomes.ids).filter((x) => x >= 0).length).toBeGreaterThan(400);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/step.test.ts`
Expected: FAIL. The modules cannot be resolved.

- [ ] **Step 3: Implement the hash**

`src/sim/hash.ts`:
```ts
import type { SimState } from "@/sim/state";

/** FNV-1a over all mutable state: used to assert determinism. */
export function hashState(s: SimState): string {
  let h = 0x811c9dc5;
  const feed = (arr: ArrayBufferView) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
  };
  feed(Int32Array.from([s.tick, s.rngState | 0]));
  feed(s.genomes.ids);
  feed(s.genomes.w);
  feed(s.attendance);
  feed(s.venueOpen);
  feed(s.venueHealth);
  feed(s.venueLowTicks);
  return (h >>> 0).toString(16).padStart(8, "0");
}
```

- [ ] **Step 4: Implement the tick**

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
  updateVenues(s);
  s.tick++;
  s.rngState = rng.state();
  return s;
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `pnpm test src/sim/step.test.ts`
Expected: `6 passed`. If "closes a venue nobody can fill" fails because the venue is still within `closeAfterTicks`, check the health maths: it starts at 0.5, with α = 0.2 and occupancy ≈ 0, it drops below 0.1 by tick 8, and closes by about tick 12 at the default settings. Do not loosen the assertion; fix the code.

- [ ] **Step 6: Run the full suite**

Run: `pnpm test`
Expected: all test files pass.

- [ ] **Step 7: Commit**

```bash
git add src/sim/step.ts src/sim/hash.ts src/sim/step.test.ts
git commit -m "feat(sim): compose deterministic tick loop with state hashing"
```

---

### Task 14: Performance benchmark

**Files:** create `scripts/bench-sim.ts`.

- [ ] **Step 1: Write the benchmark**

`scripts/bench-sim.ts`:
```ts
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const TARGET_TICKS_PER_SEC = 10;
const TICKS = 50;

const world = makeTinyWorld({ seed: 7, clusters: 20, entitiesPerCluster: 50, gridSize: 20 });
let t0 = performance.now();
const s = initState(world, DEFAULT_CONFIG, 7);
const initMs = performance.now() - t0;

t0 = performance.now();
for (let t = 0; t < TICKS; t++) step(s);
const tps = TICKS / ((performance.now() - t0) / 1000);

console.log(
  `agents=${DEFAULT_CONFIG.nAgents} entities=${world.entities.length} venues=${s.cw.venues.length} ` +
    `cells=${world.cells.length} init=${initMs.toFixed(0)}ms ticks/sec=${tps.toFixed(1)}`,
);
if (tps < TARGET_TICKS_PER_SEC) {
  console.error(`FAIL: ${tps.toFixed(1)} ticks/sec is below the ${TARGET_TICKS_PER_SEC} target`);
  process.exit(1);
}
```

- [ ] **Step 2: Run it**

Run: `pnpm bench:sim`
Expected: a line like `agents=5000 entities=1000 venues=80 cells=400 init=…ms ticks/sec=…` with ticks/sec ≥ 10, and exit code 0. If it falls below target, profile with `node --cpu-prof` through tsx and optimise the hot loop (most likely `chooseOutings` or `genomeSimilarity` in init). Do not lower the target without recording why in `docs/current-state.md`.

- [ ] **Step 3: Commit**

```bash
git add scripts/bench-sim.ts
git commit -m "perf(sim): add 5,000-agent tick-rate benchmark"
```

---

### Task 15: Update the handoff docs

**Files:** modify `docs/architecture.md`, `docs/current-state.md`, `docs/superpowers/plans/2026-10-09-roadmap.md`.

- [ ] **Step 1: Replace the "Commands" section of `docs/architecture.md`**

```markdown
## Commands

- `pnpm install` — install dependencies
- `pnpm dev` — run the Next.js dev server
- `pnpm build` — production build
- `pnpm test` — run all unit tests (Vitest)
- `pnpm test:watch` — watch mode
- `pnpm bench:sim` — simulation tick-rate benchmark (target ≥ 10 ticks/sec at 5,000 agents)
```

- [ ] **Step 2: Update `docs/current-state.md`**

Set **Phase** to "Plan 1 complete (scaffold + sim core)". Move Plan 1 into "Done", with the measured bench result (ticks/sec and init ms). Set "Next" to: write and execute Plan 2 (sim ecology), and start Plan 3 (Qloo spike) as soon as the key arrives.

- [ ] **Step 3: Set Plan 1's status in the roadmap table to "Done"**

- [ ] **Step 4: Commit**

```bash
git add docs/architecture.md docs/current-state.md docs/superpowers/plans/2026-10-09-roadmap.md
git commit -m "docs: record verified commands and Plan 1 completion"
```
