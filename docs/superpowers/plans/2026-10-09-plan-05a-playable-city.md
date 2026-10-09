# Plan 5a: Playable City — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable, game-like night city in the browser. The synthetic city is rendered as a Three.js diorama with real-style streets, a river, parks, instanced lit buildings and venue landmarks. Thousands of glowing agents stream between homes and venues as the simulation plays live in a Web Worker. You can play, pause, change speed, rewind, inspect and close venues, open venues and schedule events.

**Architecture:**
- **Worker:** gains a play loop that pushes one transferable `Frame` per tick.
- **Pure render-prep modules** (unit-tested in Node):
  - city layout: cell positions, landmark pads, buildings that avoid roads/water/parks/pads;
  - scene palette;
  - venue views;
  - ribbon and polygon geometry.
- **React Three Fiber components** render the city; visual output is checked in the browser.
- **Overlay:** HTML/Tailwind panels drive actions through a `useSimulation` hook.
- **Data flow:**
  - crowd animation reads the latest frame from a ref, so it doesn't cause React re-renders;
  - panels and landmarks re-render on frame state (≤ 8 Hz).

**Tech Stack:** Next.js 16 (App Router, Turbopack), React 19, Three.js, `@react-three/fiber` 9, `@react-three/drei` 10, `postprocessing` + `@react-three/postprocessing` 3, Tailwind 4, Vitest.

**Specs:**
- [../specs/2026-10-09-genusloci-ui-design.md](../specs/2026-10-09-genusloci-ui-design.md)
- [../specs/2026-10-09-genusloci-design.md](../specs/2026-10-09-genusloci-design.md)
- Decision 0005.

**Rules:**
- Atomic commits in Conventional Commits format; end each message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `pnpm test`, `pnpm exec tsc --noEmit` and `pnpm lint` before each commit; add `pnpm build` for UI tasks.
- Keep LF line endings (use the Edit/Write tools, not scripted rewrites).
- Read `AGENTS.md`: this Next.js version differs from older ones. Check `node_modules/next/dist/docs/` before using a Next API not shown here.
- **Lint:** satisfy the React hooks rules without blanket disables. Mutate Three.js objects only through refs, effects or `useFrame` callbacks, never values from `useMemo`/`useState` during render. If a rule is a clear false positive, use a single-line disable with a reason.

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `src/sim/timeline.ts` | Age-thinned snapshot retention, `snapshotTicks()` | modify |
| `src/world/projection.ts` | Lat/lon → local metres | new |
| `src/world/schema.ts` | `VENUE_KINDS`, entity `kind`, `geo` section | modify |
| `src/world/fixtures/synthetic-geo.ts` | Deterministic synthetic streets/river/parks | new |
| `src/world/fixtures/tiny-world.ts` | Venue kinds and `geo` in the fixture | modify |
| `src/sim/frame.ts` | `Frame` type and `buildFrame` (transferable copies) | new |
| `src/sim/worker/protocol.ts` | `play` / `pause` / `frame` commands, `FrameMessage` | modify |
| `src/sim/worker/host.ts` | Play loop via injected `HostIO` | modify |
| `src/sim/worker/sim.worker.ts` | Real `HostIO` (`postMessage` with transfer, `setTimeout`) | modify |
| `src/sim/worker/client.ts` | `onFrame`, `play`, `pause`, `frame` | modify |
| `src/render/layout.ts` | City layout: cells, pads, buildings, roads/water/parks in scene units | new |
| `src/render/palette.ts` | Scene hues and RGB | new |
| `src/render/venues.ts` | `venueViews`: per-slot landmark data from a frame | new |
| `src/render/geometry.ts` | Ribbon and polygon geometry | new |
| `src/render/frame-store.ts` | `FrameStore` type shared by the hook and the renderer | new |
| `src/render/buildingShader.ts` | Window-light GLSL | new |
| `src/render/Ground.tsx`, `Streets.tsx`, `Buildings.tsx`, `Landmarks.tsx`, `Crowd.tsx`, `CityCanvas.tsx` | R3F scene | new |
| `src/ui/demo-world.ts` | Synthetic demo city | new |
| `src/ui/useSimulation.ts` | Worker lifecycle, frames, actions | new |
| `src/ui/Hud.tsx`, `Toolbar.tsx`, `TimelineBar.tsx`, `VenuePanel.tsx`, `GameShell.tsx`, `ClientGame.tsx` | Overlay UI and composition | new |
| `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css` | App entry | modify |
| `.claude/launch.json` | Dev-server launch config for browser preview | new |

---

### Task 1: Age-thinned snapshot retention

**Files:** modify `src/sim/timeline.ts` and `src/sim/timeline.test.ts`.

- [ ] **Step 1: Write the failing test.** Add `snapshotSpacing` to the import from `@/sim/timeline` in `src/sim/timeline.test.ts`, and add inside `describe("Timeline", …)`:

```ts
  it("thins snapshots with age so old rewinds stay cheap and memory stays bounded", () => {
    const t = create(10);
    t.advance(1000);
    const ticks = t.snapshotTicks();
    expect(ticks[0]).toBe(0);
    expect(ticks.length).toBeLessThan(30);
    for (const k of ticks) {
      if (k === 0 || k === 1000) continue;
      expect(k % snapshotSpacing(1000 - k)).toBe(0);
    }
    for (let tick = 0; tick <= 1000; tick += 37) {
      const base = Math.max(...ticks.filter((k) => k <= tick));
      expect(tick - base).toBeLessThan(160);
    }
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/timeline.test.ts`
Expected: FAIL. `snapshotSpacing` and `snapshotTicks` don't exist.

- [ ] **Step 3: Implement.** In `src/sim/timeline.ts`, replace `export const MAX_SNAPSHOTS = 30;` with:

```ts
/** Snapshot spacing by age: dense for recent history, sparse for old, so old rewinds stay fast and memory stays bounded. */
export function snapshotSpacing(age: number): number {
  return age < 100 ? 10 : age < 400 ? 40 : 160;
}
```

Replace the whole `private snapshot(): void { … }` method with:
```ts
  /** Ticks that currently have a stored snapshot, ascending. */
  snapshotTicks(): number[] {
    return [...this.snapshots.keys()].sort((a, b) => a - b);
  }

  private snapshot(): void {
    const now = this.state.tick;
    this.snapshots.set(now, cloneState(this.state));
    const earliest = this.earliest();
    for (const k of [...this.snapshots.keys()]) {
      if (k === earliest || k === now) continue;
      if (k % snapshotSpacing(now - k) !== 0) this.snapshots.delete(k);
    }
  }
```
`snapshotTicks` is public, so place it above the private method.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/timeline.test.ts`
Expected: all Timeline tests pass, including the existing cap and rewind tests.

- [ ] **Step 5: Commit**

```bash
git add src/sim/timeline.ts src/sim/timeline.test.ts
git commit -m "perf(sim): thin timeline snapshots by age"
```

---

### Task 2: World `geo` section, venue kinds and synthetic streets

**Files:**
- Create: `src/world/projection.ts`, `src/world/projection.test.ts`, `src/world/fixtures/synthetic-geo.ts`, `src/world/fixtures/synthetic-geo.test.ts`
- Modify: `src/world/schema.ts`, `src/world/schema.test.ts`, `src/world/fixtures/tiny-world.ts`

- [ ] **Step 1: Write the failing tests**

`src/world/projection.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { toLocalMetres } from "@/world/projection";

describe("toLocalMetres", () => {
  const origin = { lat: 51.5, lon: -0.1 };
  it("maps the origin to (0, 0)", () => {
    expect(toLocalMetres(origin, origin)).toEqual({ x: 0, y: 0 });
  });
  it("maps north to +y and east to +x in metres", () => {
    expect(toLocalMetres({ lat: 51.51, lon: -0.1 }, origin).y).toBeCloseTo(1105.4, 0);
    expect(toLocalMetres({ lat: 51.5, lon: -0.09 }, origin).x).toBeCloseTo(693, -1);
  });
});
```

`src/world/fixtures/synthetic-geo.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { syntheticGeo } from "@/world/fixtures/synthetic-geo";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { parseWorld } from "@/world/schema";

describe("syntheticGeo", () => {
  const world = makeTinyWorld({ gridSize: 4 });
  const geo = syntheticGeo(world.cells, world.city);

  it("is deterministic", () => {
    expect(syntheticGeo(world.cells, world.city)).toEqual(geo);
  });

  it("lays a street grid inside the bounds", () => {
    // 4 columns → 5 boundary majors + 8 minors; same for rows.
    expect(geo.roads.filter((r) => r.kind === "major")).toHaveLength(10);
    expect(geo.roads.filter((r) => r.kind === "minor")).toHaveLength(16);
    for (const r of geo.roads) {
      for (const [x, y] of r.points) {
        expect(x).toBeGreaterThanOrEqual(geo.bounds.minX - 1e-6);
        expect(x).toBeLessThanOrEqual(geo.bounds.maxX + 1e-6);
        expect(y).toBeGreaterThanOrEqual(geo.bounds.minY - 1e-6);
        expect(y).toBeLessThanOrEqual(geo.bounds.maxY + 1e-6);
      }
    }
  });

  it("adds a river and some parks, and the fixture world validates", () => {
    expect(geo.water).toHaveLength(1);
    expect(geo.water[0].length).toBeGreaterThanOrEqual(3);
    expect(geo.parks.length).toBeGreaterThan(0);
    expect(() => parseWorld(world)).not.toThrow();
    expect(world.geo).toEqual(geo);
  });
});
```

Add to `src/world/schema.test.ts`, inside `describe("parseWorld", …)`:
```ts
  it("accepts venue kinds and a geo section", () => {
    const w = minimal();
    w.entities[1].kind = "club";
    w.geo = {
      bounds: { minX: -100, minY: -100, maxX: 100, maxY: 100 },
      roads: [{ kind: "major", points: [[-100, 0], [100, 0]] }],
      water: [[[0, 0], [10, 0], [10, 10]]],
      parks: [],
    };
    expect(parseWorld(w).geo?.roads).toHaveLength(1);
  });

  it("rejects bad geo and unknown venue kinds", () => {
    const badBounds = minimal();
    badBounds.geo = { bounds: { minX: 5, minY: 0, maxX: 1, maxY: 10 }, roads: [], water: [], parks: [] };
    expect(() => parseWorld(badBounds)).toThrow();
    const shortRoad = minimal();
    shortRoad.geo = { bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 }, roads: [{ kind: "minor", points: [[0, 0]] }], water: [], parks: [] };
    expect(() => parseWorld(shortRoad)).toThrow();
    const badKind = minimal() as unknown as { entities: { kind?: string }[] };
    badKind.entities[1].kind = "spaceport";
    expect(() => parseWorld(badKind)).toThrow();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test src/world`
Expected: FAIL. The new modules are missing, and `kind`/`geo` don't type-check or validate.

- [ ] **Step 3: Implement the projection**

`src/world/projection.ts`:
```ts
const METRES_PER_DEG_LAT = 110_540;
const METRES_PER_DEG_LON_AT_EQUATOR = 111_320;

export type LatLon = { lat: number; lon: number };
export type LocalPoint = { x: number; y: number };

/** Equirectangular projection to local metres around `origin` (x east, y north); accurate at city scale. */
export function toLocalMetres(p: LatLon, origin: LatLon): LocalPoint {
  return {
    x: (p.lon - origin.lon) * METRES_PER_DEG_LON_AT_EQUATOR * Math.cos((origin.lat * Math.PI) / 180),
    y: (p.lat - origin.lat) * METRES_PER_DEG_LAT,
  };
}
```

- [ ] **Step 4: Extend the schema** in `src/world/schema.ts`.

After the `ENTITY_TYPES` declaration, add:
```ts
/** Landmark styles for venues (Plan 4 maps Qloo tags to these). */
export const VENUE_KINDS = [
  "club", "bar", "cafe", "restaurant", "gallery", "music_venue", "shop", "stadium", "other",
] as const;
```

Inside `EntitySchema`'s object, after `capacity`, add:
```ts
  /** Landmark style for venues. */
  kind: z.enum(VENUE_KINDS).optional(),
```

Before `export const WorldSchema`, add:
```ts
const point = z.tuple([z.number(), z.number()]);

/** City geometry in local metres relative to `city` (x east, y north). From OpenStreetMap in real worlds. */
export const GeoSchema = z.object({
  bounds: z.object({ minX: z.number(), minY: z.number(), maxX: z.number(), maxY: z.number() }),
  roads: z.array(z.object({ kind: z.enum(["major", "minor"]), points: z.array(point).min(2) })),
  water: z.array(z.array(point).min(3)),
  parks: z.array(z.array(point).min(3)),
});
```

In `WorldSchema`'s object, after `heatmaps: z.array(HeatmapSchema),`, add:
```ts
    geo: GeoSchema.optional(),
```

At the end of the `superRefine` callback body, add:
```ts
    if (w.geo && (w.geo.bounds.minX >= w.geo.bounds.maxX || w.geo.bounds.minY >= w.geo.bounds.maxY)) {
      fail("geo.bounds must have min < max");
    }
```

After `export type EntityType = …`, add:
```ts
export type VenueKind = (typeof VENUE_KINDS)[number];
export type Geo = z.infer<typeof GeoSchema>;
```

- [ ] **Step 5: Implement the synthetic geo**

`src/world/fixtures/synthetic-geo.ts`:
```ts
import { toLocalMetres } from "@/world/projection";
import type { Geo, World } from "@/world/schema";

const RIVER_HALF_WIDTH = 60;
const RIVER_POINTS = 25;

/** Smallest gap between distinct coordinates (rounded to 1 m), or `fallback` for a single row/column. */
function gridStep(values: number[], fallback: number): number {
  const sorted = [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++) step = Math.min(step, sorted[i] - sorted[i - 1]);
  return Number.isFinite(step) ? step : fallback;
}

/**
 * Deterministic synthetic city geometry around a grid of cells (no randomness, so fixture RNG streams
 * are unaffected): major streets on cell boundaries, minor streets at thirds, a sinuous river, and a
 * park in every fifth cell. Coordinates are local metres relative to `origin`.
 */
export function syntheticGeo(cells: World["cells"], origin: { lat: number; lon: number }): Geo {
  const pts = cells.map((c) => toLocalMetres(c, origin));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const dx = gridStep(xs, 600);
  const dy = gridStep(ys, 600);
  const bounds = {
    minX: Math.min(...xs) - dx / 2,
    maxX: Math.max(...xs) + dx / 2,
    minY: Math.min(...ys) - dy / 2,
    maxY: Math.max(...ys) + dy / 2,
  };
  const cols = Math.round((bounds.maxX - bounds.minX) / dx);
  const rows = Math.round((bounds.maxY - bounds.minY) / dy);

  const roads: Geo["roads"] = [];
  for (let k = 0; k <= cols; k++) {
    const x = bounds.minX + k * dx;
    roads.push({ kind: "major", points: [[x, bounds.minY], [x, bounds.maxY]] });
    if (k < cols) {
      for (const f of [1 / 3, 2 / 3]) {
        roads.push({ kind: "minor", points: [[x + f * dx, bounds.minY], [x + f * dx, bounds.maxY]] });
      }
    }
  }
  for (let k = 0; k <= rows; k++) {
    const y = bounds.minY + k * dy;
    roads.push({ kind: "major", points: [[bounds.minX, y], [bounds.maxX, y]] });
    if (k < rows) {
      for (const f of [1 / 3, 2 / 3]) {
        roads.push({ kind: "minor", points: [[bounds.minX, y + f * dy], [bounds.maxX, y + f * dy]] });
      }
    }
  }

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  const midY = (bounds.minY + bounds.maxY) / 2;
  const centre = Array.from({ length: RIVER_POINTS }, (_, i): [number, number] => {
    const f = i / (RIVER_POINTS - 1);
    return [bounds.minX + f * width, midY + 0.22 * height * Math.sin(f * Math.PI * 2)];
  });
  const water: Geo["water"] = [
    [
      ...centre.map(([x, y]): [number, number] => [x, y + RIVER_HALF_WIDTH]),
      ...[...centre].reverse().map(([x, y]): [number, number] => [x, y - RIVER_HALF_WIDTH]),
    ],
  ];

  const parks: Geo["parks"] = pts.flatMap((p, i) =>
    i % 5 === 2
      ? [
          [
            [p.x + 0.05 * dx, p.y + 0.05 * dy],
            [p.x + 0.35 * dx, p.y + 0.05 * dy],
            [p.x + 0.35 * dx, p.y + 0.35 * dy],
            [p.x + 0.05 * dx, p.y + 0.35 * dy],
          ] as [number, number][],
        ]
      : [],
  );

  return { bounds, roads, water, parks };
}
```

- [ ] **Step 6: Give the fixture venue kinds and geo.** In `src/world/fixtures/tiny-world.ts`:
- Change the schema import to `import { VENUE_KINDS, type World } from "@/world/schema";`.
- Add `import { syntheticGeo } from "@/world/fixtures/synthetic-geo";`.
- Replace `...(isVenue ? { cell: rng.int(nCells), capacity: 50 } : {}),` with:
```ts
        ...(isVenue
          ? { cell: rng.int(nCells), capacity: 50, kind: VENUE_KINDS[(c * VENUES_PER_CLUSTER + j) % VENUE_KINDS.length] }
          : {}),
```
- Replace the final return statement with:
```ts
  const city = { name: "Synthville", lat: 51.5, lon: -0.1 };
  return { version: 1, city, entities, edges, cells, archetypes, heatmaps, geo: syntheticGeo(cells, city) };
```
The kind is computed without the RNG, and `syntheticGeo` is deterministic, so every existing seed-dependent test keeps its RNG stream.

- [ ] **Step 7: Run the tests**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.
Expected: all pass. If `tiny-world.test.ts` "has the requested shape" fails because of the new `geo` key, it shouldn't: that test only checks lengths. Investigate before changing anything.

- [ ] **Step 8: Commit**

```bash
git add src/world
git commit -m "feat(world): add geo section, venue kinds and synthetic city streets"
```

---

### Task 3: Render frames

**Files:** create `src/sim/frame.ts`; test `src/sim/frame.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/sim/frame.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { buildFrame } from "@/sim/frame";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 20 };

describe("buildFrame", () => {
  it("copies render state with venue arrays sliced to nVenues", () => {
    const s = initState(makeTinyWorld(), config, 1);
    const { frame } = buildFrame(s, "main", 0, false);
    expect(frame.tick).toBe(0);
    expect(frame.alive).toHaveLength(320);
    expect(frame.venueEntity).toHaveLength(s.nVenues);
    expect(frame.venueHealth).toHaveLength(s.nVenues);
    expect(Array.from(frame.scene).every((x) => x === -1)).toBe(true);
    expect(frame.lineageParents).toHaveLength(0);
    expect(frame.digest).toBeUndefined();
  });

  it("maps agents to scene lineage ids and carries lineage parents", () => {
    const s = initState(makeTinyWorld(), config, 1);
    step(s);
    const { frame } = buildFrame(s, "main", 0, true);
    for (let i = 0; i < 300; i++) {
      const a = s.scenes.assignment[i];
      expect(frame.scene[i]).toBe(a >= 0 ? s.scenes.live[a] : -1);
    }
    expect(Array.from(frame.lineageParents)).toEqual(s.scenes.lineages.map((l) => l.parent ?? -1));
    expect(frame.digest?.tick).toBe(1);
  });

  it("returns independent copies and one distinct transferable buffer per array", () => {
    const s = initState(makeTinyWorld(), config, 1);
    const { frame, transfer } = buildFrame(s, "main", 0, false);
    frame.alive[0] = 0;
    frame.venueOpen[0] = 0;
    expect(s.alive[0]).toBe(1);
    expect(s.venueOpen[0]).toBe(1);
    expect(transfer).toHaveLength(11);
    expect(new Set(transfer).size).toBe(11);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/sim/frame.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/sim/frame.ts`:
```ts
import { digest, type SimDigest } from "@/sim/digest";
import type { SimState } from "@/sim/state";

/** One tick's render data, streamed from the worker. Every typed array is a fresh copy, safe to transfer. */
export type Frame = {
  timeline: string;
  tick: number;
  earliestTick: number;
  alive: Uint8Array;
  homeCell: Int32Array;
  attendance: Int32Array;
  /** Per agent slot: lineage id of its scene, or -1. */
  scene: Int32Array;
  /** Per lineage id: parent lineage id, or -1. */
  lineageParents: Int32Array;
  nVenues: number;
  venueEntity: Int32Array;
  venueCell: Int32Array;
  venueOpen: Uint8Array;
  venueHealth: Float32Array;
  venueAttendance: Int32Array;
  venueExpires: Int32Array;
  digest?: SimDigest;
};

export function buildFrame(
  s: SimState,
  timeline: string,
  earliestTick: number,
  withDigest: boolean,
): { frame: Frame; transfer: ArrayBuffer[] } {
  const scene = new Int32Array(s.alive.length).fill(-1);
  for (let i = 0; i < scene.length; i++) {
    const a = s.scenes.assignment[i];
    if (a >= 0) scene[i] = s.scenes.live[a];
  }
  const n = s.nVenues;
  const frame: Frame = {
    timeline,
    tick: s.tick,
    earliestTick,
    alive: s.alive.slice(),
    homeCell: s.homeCell.slice(),
    attendance: s.attendance.slice(),
    scene,
    lineageParents: Int32Array.from(s.scenes.lineages, (l) => l.parent ?? -1),
    nVenues: n,
    venueEntity: s.venueEntity.slice(0, n),
    venueCell: s.venueCell.slice(0, n),
    venueOpen: s.venueOpen.slice(0, n),
    venueHealth: s.venueHealth.slice(0, n),
    venueAttendance: s.venueAttendance.slice(0, n),
    venueExpires: s.venueExpires.slice(0, n),
  };
  if (withDigest) frame.digest = digest(s);
  const transfer = [
    frame.alive, frame.homeCell, frame.attendance, frame.scene, frame.lineageParents,
    frame.venueEntity, frame.venueCell, frame.venueOpen, frame.venueHealth, frame.venueAttendance, frame.venueExpires,
  ].map((a) => a.buffer as ArrayBuffer);
  return { frame, transfer };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/sim/frame.test.ts`
Expected: `3 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/sim/frame.ts src/sim/frame.test.ts
git commit -m "feat(sim): build transferable render frames"
```

---

### Task 4: Stream frames from the worker (play / pause)

**Files:**
- Modify: `src/sim/worker/protocol.ts`, `src/sim/worker/host.ts`, `src/sim/worker/sim.worker.ts`, `src/sim/worker/client.ts`
- Test: `src/sim/worker/host-play.test.ts`, `src/sim/worker/client-frames.test.ts`

- [ ] **Step 1: Write the failing tests**

`src/sim/worker/host-play.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { type HostIO, SimHost } from "@/sim/worker/host";
import type { FrameMessage, WorkerCommand } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

function fakeIo() {
  const scheduled: { fn: () => void; ms: number; handle: number }[] = [];
  const cancelled: unknown[] = [];
  const frames: FrameMessage[] = [];
  let next = 1;
  const io: HostIO = {
    emit: (message) => frames.push(message),
    schedule: (fn, ms) => {
      const handle = next++;
      scheduled.push({ fn, ms, handle });
      return handle;
    },
    cancel: (handle) => cancelled.push(handle),
  };
  return { io, scheduled, cancelled, frames, runNext: () => scheduled.shift()?.fn() };
}

const config = { nAgents: 200, agentReserve: 0 };
let id = 0;
const send = (host: SimHost, cmd: WorkerCommand) => host.handle({ ...cmd, id: ++id });

describe("SimHost streaming", () => {
  it("plays one tick per interval, pushing frames with a digest every 4th", () => {
    const f = fakeIo();
    const host = new SimHost(f.io);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    expect(send(host, { type: "play", timeline: "main", ticksPerSecond: 4 })).toMatchObject({ ok: true, result: { playing: true } });
    expect(f.scheduled[0].ms).toBe(250);
    for (let k = 0; k < 4; k++) f.runNext();
    expect(f.frames.map((m) => m.frame.tick)).toEqual([1, 2, 3, 4]);
    expect(f.frames.map((m) => m.frame.digest !== undefined)).toEqual([false, false, false, true]);
    expect(f.scheduled).toHaveLength(1);
  });

  it("pauses: cancels the pending tick and ignores stale callbacks", () => {
    const f = fakeIo();
    const host = new SimHost(f.io);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    send(host, { type: "play", timeline: "main", ticksPerSecond: 2 });
    const pending = f.scheduled[0];
    expect(send(host, { type: "pause" })).toMatchObject({ ok: true, result: { playing: false } });
    expect(f.cancelled).toContain(pending.handle);
    pending.fn();
    expect(f.frames).toHaveLength(0);
  });

  it("stops playing on re-init and when the playing timeline is disposed", () => {
    const f = fakeIo();
    const host = new SimHost(f.io);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    send(host, { type: "play", timeline: "main", ticksPerSecond: 2 });
    send(host, { type: "init", world: makeTinyWorld(), seed: 2, config });
    expect(f.cancelled).toHaveLength(1);
    send(host, { type: "fork", timeline: "main" });
    send(host, { type: "play", timeline: "fork-1", ticksPerSecond: 2 });
    send(host, { type: "dispose", timeline: "fork-1" });
    expect(f.cancelled).toHaveLength(2);
  });

  it("validates play and serves one-off frames with a digest", () => {
    const host = new SimHost(fakeIo().io);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    expect(send(host, { type: "play", timeline: "main", ticksPerSecond: 0 }).ok).toBe(false);
    expect(send(host, { type: "play", timeline: "main", ticksPerSecond: 100 }).ok).toBe(false);
    expect(send(host, { type: "play", timeline: "nope", ticksPerSecond: 2 }).ok).toBe(false);
    const r = send(host, { type: "frame", timeline: "main" });
    if (!r.ok) throw new Error(r.error);
    const { frame } = r.result as { frame: { tick: number; digest?: unknown } };
    expect(frame.tick).toBe(0);
    expect(frame.digest).toBeDefined();
  });
});
```

`src/sim/worker/client-frames.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { SimClient, type WorkerLike } from "@/sim/worker/client";
import { SimHost } from "@/sim/worker/host";
import type { WorkerMessage, WorkerRequest } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

/** In-process worker whose play loop is driven manually with tick(). */
function streamingWorker() {
  const listeners: ((e: MessageEvent<WorkerMessage>) => void)[] = [];
  const queue: (() => void)[] = [];
  const deliver = (m: WorkerMessage) => listeners.forEach((l) => l({ data: m } as MessageEvent<WorkerMessage>));
  const host = new SimHost({
    emit: (m) => deliver(m),
    schedule: (fn) => queue.push(fn),
    cancel: () => {},
  });
  const worker: WorkerLike = {
    postMessage: (message) => queueMicrotask(() => deliver(host.handle(message as WorkerRequest))),
    addEventListener: ((type: string, listener: (e: MessageEvent<WorkerMessage>) => void) => {
      if (type === "message") listeners.push(listener);
    }) as WorkerLike["addEventListener"],
    terminate: () => {},
  };
  return { worker, tick: () => queue.shift()?.() };
}

describe("SimClient frames", () => {
  it("delivers pushed frames to onFrame listeners until unsubscribed", async () => {
    const { worker, tick } = streamingWorker();
    const client = new SimClient(worker);
    await client.init(makeTinyWorld(), 1, { nAgents: 200, agentReserve: 0 });
    const ticks: number[] = [];
    const off = client.onFrame((f) => ticks.push(f.tick));
    await client.play("main", 8);
    tick();
    tick();
    off();
    tick();
    expect(ticks).toEqual([1, 2]);
    const { frame } = await client.frame("main");
    expect(frame.tick).toBe(3);
    expect(await client.pause()).toEqual({ playing: false });
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test src/sim/worker`
Expected: FAIL. `HostIO`, `play`, `FrameMessage` and `onFrame` don't exist.

- [ ] **Step 3: Extend the protocol** in `src/sim/worker/protocol.ts`.
- Add `import type { Frame } from "@/sim/frame";`.
- After `MAX_TICKS_PER_RUN`, add:
```ts
export const MIN_TICKS_PER_SECOND = 0.25;
export const MAX_TICKS_PER_SECOND = 30;
/** Pushed frames carry a digest every Nth tick (the digest's fidelity costs a few ms). */
export const DIGEST_EVERY = 4;
```
- Add these members to the `WorkerCommand` union:
```ts
  | { type: "play"; timeline: string; ticksPerSecond: number }
  | { type: "pause" }
  | { type: "frame"; timeline: string }
```
- Add to `CommandResults`:
```ts
  play: { playing: true };
  pause: { playing: false };
  frame: { frame: Frame };
```
- Append:
```ts
/** Pushed by the worker while playing (no request id). */
export type FrameMessage = { kind: "frame"; frame: Frame };
export type WorkerMessage = WorkerResponse | FrameMessage;
```

- [ ] **Step 4: Add the play loop** to `src/sim/worker/host.ts`.
- Add `import { buildFrame } from "@/sim/frame";`.
- Add `DIGEST_EVERY`, `type FrameMessage`, `MAX_TICKS_PER_SECOND` and `MIN_TICKS_PER_SECOND` to the protocol import.
- Above the class, add:
```ts
/** Side effects the host needs for streaming; injected so tests can drive the loop by hand. */
export type HostIO = {
  emit(message: FrameMessage, transfer: ArrayBuffer[]): void;
  schedule(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
};

const NO_IO: HostIO = { emit: () => {}, schedule: () => null, cancel: () => {} };

type Player = { timeline: string; intervalMs: number; handle: unknown; count: number };
```
- Inside the class, after the `forks` field, add:
```ts
  private player: Player | null = null;

  constructor(private readonly io: HostIO = NO_IO) {}

  private stopPlaying(): void {
    if (this.player) this.io.cancel(this.player.handle);
    this.player = null;
  }

  private readonly loop = (): void => {
    const p = this.player;
    if (!p) return;
    const t = this.timelines.get(p.timeline);
    if (!t) {
      this.stopPlaying();
      return;
    }
    try {
      t.advance(1);
      p.count++;
      const { frame, transfer } = buildFrame(t.state, p.timeline, t.earliest(), p.count % DIGEST_EVERY === 0);
      this.io.emit({ kind: "frame", frame }, transfer);
    } catch {
      this.stopPlaying();
      return;
    }
    p.handle = this.io.schedule(this.loop, p.intervalMs);
  };
```
- In `case "init"`, call `this.stopPlaying();` immediately after the `const t = Timeline.create(…)` line, so a failed init keeps the current playback.
- In `case "dispose"`, call `if (this.player?.timeline === cmd.timeline) this.stopPlaying();` before `this.timelines.delete(cmd.timeline);`.
- Add these cases before `default:`:
```ts
      case "play": {
        if (!(cmd.ticksPerSecond >= MIN_TICKS_PER_SECOND && cmd.ticksPerSecond <= MAX_TICKS_PER_SECOND)) {
          throw new Error(`ticksPerSecond must be in [${MIN_TICKS_PER_SECOND}, ${MAX_TICKS_PER_SECOND}]`);
        }
        this.timeline(cmd.timeline);
        this.stopPlaying();
        const player: Player = { timeline: cmd.timeline, intervalMs: 1000 / cmd.ticksPerSecond, handle: null, count: 0 };
        this.player = player;
        player.handle = this.io.schedule(this.loop, player.intervalMs);
        return { playing: true };
      }
      case "pause":
        this.stopPlaying();
        return { playing: false };
      case "frame": {
        const t = this.timeline(cmd.timeline);
        return { frame: buildFrame(t.state, cmd.timeline, t.earliest(), true).frame };
      }
```

- [ ] **Step 5: Wire the real IO** in `src/sim/worker/sim.worker.ts`. Replace the file with:
```ts
import { SimHost } from "@/sim/worker/host";
import type { WorkerRequest } from "@/sim/worker/protocol";

// Web Worker entry: one SimHost per worker. Requests get exactly one response; while playing, frames
// are pushed with their typed arrays transferred (not copied).
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
  postMessage(message: unknown, transfer?: Transferable[]): void;
};
const host = new SimHost({
  emit: (message, transfer) => scope.postMessage(message, transfer),
  schedule: (fn, ms) => setTimeout(fn, ms),
  cancel: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>),
});
scope.onmessage = (e) => scope.postMessage(host.handle(e.data));
```

- [ ] **Step 6: Extend the client** in `src/sim/worker/client.ts`.
- Add `import type { Frame } from "@/sim/frame";` and add `WorkerMessage` to the protocol type import (`WorkerResponse` can be dropped if it becomes unused).
- In `WorkerLike`, change the message listener's event type to `MessageEvent<WorkerMessage>`.
- Add the field `private readonly frameListeners = new Set<(frame: Frame) => void>();`.
- Replace the start of the `"message"` listener body so that pushed frames are dispatched first:
```ts
    worker.addEventListener("message", (e) => {
      const data = e.data;
      if ("kind" in data) {
        for (const listener of this.frameListeners) listener(data.frame);
        return;
      }
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.ok) p.resolve(data.result);
      else p.reject(new Error(data.error));
    });
```
- Add these methods next to the other commands:
```ts
  /** Subscribes to frames pushed while playing; returns an unsubscribe function. */
  onFrame(listener: (frame: Frame) => void): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }
  play(timeline: string, ticksPerSecond: number) {
    return this.request<"play">({ type: "play", timeline, ticksPerSecond });
  }
  pause() {
    return this.request<"pause">({ type: "pause" });
  }
  frame(timeline: string) {
    return this.request<"frame">({ type: "frame", timeline });
  }
```
- If the existing `client.test.ts` fake no longer type-checks against the widened listener type, cast its `addEventListener` the way `client-frames.test.ts` does. Don't change its behaviour.

- [ ] **Step 7: Run all tests**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.
Expected: all pass, including 4 + 1 new tests.

- [ ] **Step 8: Commit**

```bash
git add src/sim/worker
git commit -m "feat(sim): stream transferable frames from a worker play loop"
```

---

### Task 5: Install the 3D stack

**Files:** modify `package.json` and `pnpm-lock.yaml`.

- [ ] **Step 1: Install**

```bash
pnpm add three@^0.186.1 @react-three/fiber@^9.8.1 @react-three/drei@^10.7.9 postprocessing@^6.39.5 @react-three/postprocessing@^3.1.3
pnpm add -D @types/three@^0.186.0
```

- [ ] **Step 2: Verify**

Run: `pnpm build` and `pnpm test`.
Expected: both pass. Nothing imports the new packages yet.

- [ ] **Step 3: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "build: add three, react-three-fiber, drei and postprocessing"
```

---

### Task 6: City layout

**Files:** create `src/render/layout.ts`; test `src/render/layout.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/render/layout.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import {
  agentHomePosition, buildLayout, distToSegment, hash01, landmarkPosition, nearestCell,
  PAD_CLEARANCE, PADS_PER_CELL, pointInPolygon, ROAD_HALF_WIDTH,
} from "@/render/layout";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld({ seed: 7, clusters: 6, entitiesPerCluster: 20, gridSize: 10 });
const layout = buildLayout(world);

describe("helpers", () => {
  it("hash01 is deterministic and in [0, 1)", () => {
    expect(hash01(42)).toBe(hash01(42));
    for (let i = 0; i < 1000; i++) {
      const h = hash01(i);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(1);
    }
  });

  it("measures point-segment distance and point-in-polygon", () => {
    expect(distToSegment(0, 1, [-1, 0], [1, 0])).toBeCloseTo(1);
    expect(distToSegment(3, 0, [-1, 0], [1, 0])).toBeCloseTo(2);
    const square: [number, number][] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(pointInPolygon(1, 1, square)).toBe(true);
    expect(pointInPolygon(3, 1, square)).toBe(false);
  });
});

describe("buildLayout", () => {
  it("is deterministic", () => {
    expect(buildLayout(world)).toEqual(layout);
  });

  it("places cells and maps each back to itself", () => {
    expect(layout.cellX).toHaveLength(world.cells.length);
    expect(layout.spacing).toBeGreaterThan(10);
    for (let c = 0; c < world.cells.length; c++) expect(nearestCell(layout, layout.cellX[c], layout.cellZ[c])).toBe(c);
  });

  it("builds a city of buildings that avoid roads, water, parks and landmark pads", () => {
    const b = layout.buildings;
    expect(b.count).toBeGreaterThan(500);
    const segments = layout.roads.flatMap((r) => r.points.slice(1).map((p, i) => ({ a: r.points[i], b: p, half: ROAD_HALF_WIDTH[r.kind] })));
    for (let i = 0; i < b.count; i++) {
      const radius = Math.hypot(b.w[i], b.d[i]) / 2;
      for (const s of segments) expect(distToSegment(b.x[i], b.z[i], s.a, s.b)).toBeGreaterThanOrEqual(s.half + radius - 1e-4);
      for (const poly of [...layout.water, ...layout.parks]) expect(pointInPolygon(b.x[i], b.z[i], poly)).toBe(false);
      for (let p = 0; p < layout.pads.length; p += 2) {
        expect(Math.hypot(layout.pads[p] - b.x[i], layout.pads[p + 1] - b.z[i])).toBeGreaterThanOrEqual(radius + PAD_CLEARANCE - 1e-4);
      }
      expect(b.h[i]).toBeGreaterThan(0);
    }
  });

  it("builds more in denser cells", () => {
    const counts = new Array(world.cells.length).fill(0);
    for (let i = 0; i < layout.buildings.count; i++) counts[nearestCell(layout, layout.buildings.x[i], layout.buildings.z[i])]++;
    const order = world.cells.map((c, i) => ({ d: c.density, n: counts[i] })).sort((a, b) => a.d - b.d);
    const half = Math.floor(order.length / 2);
    const mean = (xs: { n: number }[]) => xs.reduce((a, x) => a + x.n, 0) / xs.length;
    expect(mean(order.slice(half))).toBeGreaterThan(mean(order.slice(0, half)));
  });

  it("gives each cell PADS_PER_CELL distinct landmark pads and deterministic agent homes", () => {
    expect(layout.pads).toHaveLength(world.cells.length * PADS_PER_CELL * 2);
    const [x0, z0] = landmarkPosition(layout, 3, 0);
    const [x1, z1] = landmarkPosition(layout, 3, 1);
    expect(Math.hypot(x1 - x0, z1 - z0)).toBeGreaterThan(1);
    expect(landmarkPosition(layout, 3, PADS_PER_CELL)).toEqual(landmarkPosition(layout, 3, 0));
    const home = agentHomePosition(layout, 5, 123);
    expect(agentHomePosition(layout, 5, 123)).toEqual(home);
    expect(Math.hypot(home[0] - layout.cellX[5], home[1] - layout.cellZ[5])).toBeLessThanOrEqual(layout.spacing * 0.4 + 1e-4);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/render/layout.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/render/layout.ts`:
```ts
import { createRng } from "@/sim/rng";
import { toLocalMetres } from "@/world/projection";
import type { World } from "@/world/schema";

/** 1 scene unit = 10 m. Scene x = east, scene z = south (local y north → -z). */
export const METRES_PER_UNIT = 10;
export const PADS_PER_CELL = 6;
/** Minimum distance (scene units) between a building's footprint and a landmark pad. */
export const PAD_CLEARANCE = 4;
export const ROAD_HALF_WIDTH = { major: 1.2, minor: 0.6 } as const;
const MAX_BUILDINGS = 4000;
const CANDIDATES = 12000;
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
  add(x0: number, z0: number, x1: number, z1: number, item: T): void {
    for (let i = Math.floor(x0 / HASH_CELL); i <= Math.floor(x1 / HASH_CELL); i++) {
      for (let j = Math.floor(z0 / HASH_CELL); j <= Math.floor(z1 / HASH_CELL); j++) {
        const key = `${i},${j}`;
        const list = this.cells.get(key);
        if (list) list.push(item);
        else this.cells.set(key, [item]);
      }
    }
  }
  near(x: number, z: number, r: number): T[] {
    const out = new Set<T>();
    for (let i = Math.floor((x - r) / HASH_CELL); i <= Math.floor((x + r) / HASH_CELL); i++) {
      for (let j = Math.floor((z - r) / HASH_CELL); j <= Math.floor((z + r) / HASH_CELL); j++) {
        for (const item of this.cells.get(`${i},${j}`) ?? []) out.add(item);
      }
    }
    return [...out];
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

  const pads = new Float32Array(nC * PADS_PER_CELL * 2);
  const padHash = new SpatialHash<XZ>();
  for (let c = 0; c < nC; c++) {
    for (let k = 0; k < PADS_PER_CELL; k++) {
      const a = (k / PADS_PER_CELL) * Math.PI * 2 + Math.PI / 6;
      const r = spacing * 0.22;
      const x = cellX[c] + r * Math.cos(a);
      const z = cellZ[c] + r * Math.sin(a);
      pads[(c * PADS_PER_CELL + k) * 2] = x;
      pads[(c * PADS_PER_CELL + k) * 2 + 1] = z;
      padHash.add(x, z, x, z, [x, z]);
    }
  }

  const roadHash = new SpatialHash<{ a: XZ; b: XZ; half: number }>();
  for (const r of roads) {
    const half = ROAD_HALF_WIDTH[r.kind];
    for (let i = 0; i + 1 < r.points.length; i++) {
      const a = r.points[i];
      const b = r.points[i + 1];
      roadHash.add(Math.min(a[0], b[0]) - half, Math.min(a[1], b[1]) - half, Math.max(a[0], b[0]) + half, Math.max(a[1], b[1]) + half, { a, b, half });
    }
  }

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
    const w = 2.5 + rng.next() * 2.5;
    const d = 2.5 + rng.next() * 2.5;
    const heightRoll = rng.next();
    const acceptRoll = rng.next();

    const cell = nearestCell({ cellX, cellZ }, x, z);
    if (Math.hypot(cellX[cell] - x, cellZ[cell] - z) > spacing) continue;
    const dn = norm(cell);
    if (acceptRoll > 0.15 + 0.85 * dn) continue;

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
    bh[count] = 1.5 + heightRoll * (2 + 12 * dn * dn);
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/render/layout.test.ts`
Expected: `7 passed`. If "more than 500 buildings" fails, report the count rather than lowering the bar. Raising `CANDIDATES` is the intended lever.

- [ ] **Step 5: Commit**

```bash
git add src/render/layout.ts src/render/layout.test.ts
git commit -m "feat(render): lay out city cells, landmark pads and buildings"
```

---

### Task 7: Scene palette and venue views

**Files:** create `src/render/palette.ts`, `src/render/venues.ts`; tests `src/render/palette.test.ts`, `src/render/venues.test.ts`.

- [ ] **Step 1: Write the failing tests**

`src/render/palette.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { hslToRgb, sceneHues, sceneRgb, UNASSIGNED_RGB } from "@/render/palette";

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("palette", () => {
  it("converts HSL to RGB", () => {
    expect(hslToRgb(0, 1, 0.5).map((x) => Math.round(x * 100) / 100)).toEqual([1, 0, 0]);
    expect(hslToRgb(120, 1, 0.5).map((x) => Math.round(x * 100) / 100)).toEqual([0, 1, 0]);
  });

  it("spreads root scenes and keeps children near their parent", () => {
    const parents = Int32Array.from([-1, -1, 0, 0, 1, 2]);
    const hues = sceneHues(parents);
    expect(hueGap(hues[0], hues[1])).toBeGreaterThan(60);
    expect(hueGap(hues[2], hues[0])).toBeLessThanOrEqual(40);
    expect(hueGap(hues[3], hues[0])).toBeLessThanOrEqual(40);
    expect(hues[2]).not.toBe(hues[3]);
    expect(hueGap(hues[5], hues[2])).toBeLessThanOrEqual(40);
    expect(sceneHues(parents)).toEqual(hues);
  });

  it("colours unassigned agents grey", () => {
    expect(sceneRgb(sceneHues(Int32Array.from([-1])), -1)).toEqual(UNASSIGNED_RGB);
  });
});
```

`src/render/venues.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { buildLayout, landmarkPosition } from "@/render/layout";
import { venueViews } from "@/render/venues";
import { DEFAULT_CONFIG } from "@/sim/config";
import { buildFrame } from "@/sim/frame";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const layout = buildLayout(world);

describe("venueViews", () => {
  it("describes every venue slot with name, kind and a pad position", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 0 }, 1);
    step(s);
    const { frame } = buildFrame(s, "main", 0, false);
    const views = venueViews(frame, layout, world);
    expect(views).toHaveLength(s.nVenues);
    for (const v of views) {
      expect(v.name).toBe(world.entities[v.entity].name);
      expect(v.kind).toBe(world.entities[v.entity].kind);
    }
    const byCell = new Map<number, number>();
    for (let v = 0; v < s.nVenues; v++) {
      const cell = s.venueCell[v];
      const pad = byCell.get(cell) ?? 0;
      byCell.set(cell, pad + 1);
      expect(views[v].position).toEqual(landmarkPosition(layout, cell, pad));
    }
  });

  it("picks the majority scene among tonight's visitors", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 10, agentReserve: 0 }, 1);
    const { frame } = buildFrame(s, "main", 0, false);
    frame.attendance.fill(-1);
    frame.attendance.set([0, 0, 0, 0], 0);
    frame.scene.set([7, 7, 3, 7], 0);
    const views = venueViews(frame, layout, world);
    expect(views[0].dominantScene).toBe(7);
    expect(views[1].dominantScene).toBe(-1);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm test src/render`
Expected: FAIL. The modules cannot be resolved.

- [ ] **Step 3: Implement the palette**

`src/render/palette.ts`:
```ts
const GOLDEN_ANGLE = 137.508;

export type Rgb = [number, number, number];
export const UNASSIGNED_RGB: Rgb = [0.55, 0.57, 0.62];

/**
 * Hue in degrees per lineage id. Roots are spread by the golden angle. Children are offset from their
 * parent by ±24°, ±32°, … in birth order, so related scenes look related.
 */
export function sceneHues(parents: ArrayLike<number>): Float32Array {
  const hues = new Float32Array(parents.length);
  const children = new Map<number, number>();
  for (let id = 0; id < parents.length; id++) {
    const parent = parents[id];
    if (parent < 0 || parent >= id) {
      hues[id] = (id * GOLDEN_ANGLE) % 360;
      continue;
    }
    const k = children.get(parent) ?? 0;
    children.set(parent, k + 1);
    const offset = (k % 2 === 0 ? 1 : -1) * (24 + 8 * Math.floor(k / 2));
    hues[id] = (((hues[parent] + offset) % 360) + 360) % 360;
  }
  return hues;
}

/** h in degrees, s and l in [0, 1] → RGB in [0, 1]. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

export function sceneRgb(hues: Float32Array, id: number): Rgb {
  return id < 0 || id >= hues.length ? UNASSIGNED_RGB : hslToRgb(hues[id], 0.85, 0.6);
}
```

- [ ] **Step 4: Implement venue views**

`src/render/venues.ts`:
```ts
import { type CityLayout, landmarkPosition, type XZ } from "@/render/layout";
import type { Frame } from "@/sim/frame";
import type { VenueKind, World } from "@/world/schema";

export type VenueView = {
  slot: number;
  entity: number;
  name: string;
  kind: VenueKind;
  position: XZ;
  open: boolean;
  isEvent: boolean;
  health: number;
  visitors: number;
  /** Lineage id of the most common scene among this tick's visitors, or -1. */
  dominantScene: number;
};

/** Per venue slot render data. Venues in the same cell take landmark pads in slot order. */
export function venueViews(frame: Frame, layout: CityLayout, world: World): VenueView[] {
  const counts = Array.from({ length: frame.nVenues }, () => new Map<number, number>());
  for (let i = 0; i < frame.attendance.length; i++) {
    const v = frame.attendance[i];
    const scene = frame.scene[i];
    if (v < 0 || v >= frame.nVenues || scene < 0) continue;
    counts[v].set(scene, (counts[v].get(scene) ?? 0) + 1);
  }
  const padsUsed = new Map<number, number>();
  const views: VenueView[] = [];
  for (let v = 0; v < frame.nVenues; v++) {
    const cell = frame.venueCell[v];
    const pad = padsUsed.get(cell) ?? 0;
    padsUsed.set(cell, pad + 1);
    let dominantScene = -1;
    let best = 0;
    for (const [scene, k] of counts[v]) {
      if (k > best || (k === best && scene < dominantScene)) {
        best = k;
        dominantScene = scene;
      }
    }
    const entity = frame.venueEntity[v];
    views.push({
      slot: v,
      entity,
      name: world.entities[entity].name,
      kind: world.entities[entity].kind ?? "other",
      position: landmarkPosition(layout, cell, pad),
      open: frame.venueOpen[v] === 1,
      isEvent: frame.venueExpires[v] >= 0,
      health: frame.venueHealth[v],
      visitors: frame.venueAttendance[v],
      dominantScene,
    });
  }
  return views;
}
```

- [ ] **Step 5: Run them to verify they pass**

Run: `pnpm test src/render`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/render/palette.ts src/render/palette.test.ts src/render/venues.ts src/render/venues.test.ts
git commit -m "feat(render): add scene palette and venue views"
```

---

### Task 8: Street and polygon geometry

**Files:** create `src/render/geometry.ts`; test `src/render/geometry.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/render/geometry.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { polygonGeometry, ribbonGeometry } from "@/render/geometry";

describe("ribbonGeometry", () => {
  it("builds 4 vertices and 2 up-facing triangles per segment", () => {
    const g = ribbonGeometry([[[0, 0], [10, 0], [10, 10]]], 1);
    expect(g.getAttribute("position").count).toBe(8);
    expect(g.getIndex()?.count).toBe(12);
    const normals = g.getAttribute("normal");
    for (let i = 0; i < normals.count; i++) expect(normals.getY(i)).toBeCloseTo(1);
    g.computeBoundingBox();
    expect(g.boundingBox?.min.x).toBeCloseTo(-1);
    expect(g.boundingBox?.max.x).toBeCloseTo(11);
  });

  it("skips zero-length segments", () => {
    expect(ribbonGeometry([[[0, 0], [0, 0]]], 1).getAttribute("position").count).toBe(0);
  });
});

describe("polygonGeometry", () => {
  it("returns null for no polygons", () => {
    expect(polygonGeometry([])).toBeNull();
  });

  it("lays polygons flat in scene x/z", () => {
    const g = polygonGeometry([[[0, 0], [4, 0], [4, 6], [0, 6]], [[10, 10], [12, 10], [12, 12]]]);
    expect(g).not.toBeNull();
    g?.computeBoundingBox();
    const box = g?.boundingBox;
    expect(box?.min.x).toBeCloseTo(0);
    expect(box?.max.x).toBeCloseTo(12);
    expect(box?.min.z).toBeCloseTo(0);
    expect(box?.max.z).toBeCloseTo(12);
    expect(box?.min.y).toBeCloseTo(0);
    expect(box?.max.y).toBeCloseTo(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/render/geometry.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/render/geometry.ts`:
```ts
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { XZ } from "@/render/layout";

/** Flat ribbons (y = 0) along polylines, `halfWidth` either side: 4 vertices and 2 triangles per segment. */
export function ribbonGeometry(lines: XZ[][], halfWidth: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len === 0) continue;
      const nx = (-(bz - az) / len) * halfWidth;
      const nz = ((bx - ax) / len) * halfWidth;
      const base = positions.length / 3;
      positions.push(ax + nx, 0, az + nz, ax - nx, 0, az - nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz);
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Flat polygons (y = 0) from scene-space rings; null when there are none. */
export function polygonGeometry(polys: XZ[][]): THREE.BufferGeometry | null {
  if (polys.length === 0) return null;
  const parts = polys.map((ring) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z))));
    g.rotateX(-Math.PI / 2);
    return g;
  });
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm test src/render/geometry.test.ts`
Expected: `4 passed`.

- [ ] **Step 5: Commit**

```bash
git add src/render/geometry.ts src/render/geometry.test.ts
git commit -m "feat(render): add street ribbon and polygon geometry"
```

---

### Task 9: City scene — ground, streets, buildings

**Files:** create `src/render/frame-store.ts`, `src/render/buildingShader.ts`, `src/render/Ground.tsx`, `src/render/Streets.tsx`, `src/render/Buildings.tsx`.

- [ ] **Step 1: Create the shared frame-store type**

`src/render/frame-store.ts`:
```ts
import type { Frame } from "@/sim/frame";

/** Latest and previous frames, held in a ref so per-frame animation doesn't re-render React. */
export type FrameStore = { current: Frame | null; previous: Frame | null; receivedAt: number };
```

- [ ] **Step 2: Create the window-light shader**

`src/render/buildingShader.ts`:
```ts
/** Instanced unit boxes (base at y = 0); per-instance aSeed and aLit (share of lit windows). */
export const BUILDING_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aLit;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vSeed;
  varying float vLit;
  void main() {
    vec4 local = vec4(position + vec3(0.0, 0.5, 0.0), 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    vSeed = aSeed;
    vLit = aLit;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Dark facades with a grid of warm windows (≈3 m × 3.5 m in world space) that flicker; values > 1 feed bloom. */
export const BUILDING_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vSeed;
  varying float vLit;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float light = 0.55 + 0.45 * max(dot(vNormal, normalize(vec3(0.4, 0.8, 0.3))), 0.0);
    vec3 color = vec3(0.045, 0.05, 0.075) * light;
    float wall = 1.0 - step(0.5, abs(vNormal.y));
    vec2 facade = vec2(abs(vNormal.x) > 0.5 ? vWorld.z : vWorld.x, vWorld.y);
    vec2 size = vec2(0.3, 0.35);
    vec2 cell = floor(facade / size);
    vec2 f = fract(facade / size);
    float window = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8) * step(0.2, vWorld.y);
    float roll = hash(cell + vSeed * 17.0);
    float on = step(roll, vLit) * wall;
    float flicker = 0.8 + 0.2 * sin(uTime * (1.5 + roll * 2.0) + roll * 40.0);
    color = mix(color, vec3(1.7, 1.25, 0.75) * flicker, window * on);
    color += (1.0 - wall) * vec3(0.03, 0.035, 0.05);
    gl_FragColor = vec4(color, 1.0);
  }
`;
```

- [ ] **Step 3: Create the ground, water and parks**

`src/render/Ground.tsx`:
```tsx
"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { polygonGeometry } from "@/render/geometry";
import type { CityLayout } from "@/render/layout";

/** Pointer movement (px) above which a press counts as a drag, not a click. */
const CLICK_SLOP = 4;

export function Ground({ layout, onGroundClick }: { layout: CityLayout; onGroundClick: (x: number, z: number) => void }) {
  const water = useMemo(() => polygonGeometry(layout.water), [layout]);
  const parks = useMemo(() => polygonGeometry(layout.parks), [layout]);
  useEffect(
    () => () => {
      water?.dispose();
      parks?.dispose();
    },
    [water, parks],
  );
  const { center, bounds } = layout;
  const width = (bounds.maxX - bounds.minX) * 1.6;
  const depth = (bounds.maxZ - bounds.minZ) * 1.6;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_SLOP) return;
    e.stopPropagation();
    onGroundClick(e.point.x, e.point.z);
  };
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[center.x, 0, center.z]} onClick={onClick}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#0c0e13" roughness={1} />
      </mesh>
      {water && (
        <mesh geometry={water} position-y={0.02}>
          <meshStandardMaterial color="#0a1726" roughness={0.25} metalness={0.3} />
        </mesh>
      )}
      {parks && (
        <mesh geometry={parks} position-y={0.03}>
          <meshStandardMaterial color="#0d1c12" roughness={1} />
        </mesh>
      )}
    </group>
  );
}
```

- [ ] **Step 4: Create the streets**

`src/render/Streets.tsx`:
```tsx
"use client";

import { useEffect, useMemo } from "react";
import { ribbonGeometry } from "@/render/geometry";
import { type CityLayout, ROAD_HALF_WIDTH } from "@/render/layout";

export function Streets({ layout }: { layout: CityLayout }) {
  const geometry = useMemo(() => {
    const major = layout.roads.filter((r) => r.kind === "major").map((r) => r.points);
    const minor = layout.roads.filter((r) => r.kind === "minor").map((r) => r.points);
    return {
      major: ribbonGeometry(major, ROAD_HALF_WIDTH.major),
      minor: ribbonGeometry(minor, ROAD_HALF_WIDTH.minor),
      glow: ribbonGeometry(major, 0.08),
    };
  }, [layout]);
  useEffect(
    () => () => {
      geometry.major.dispose();
      geometry.minor.dispose();
      geometry.glow.dispose();
    },
    [geometry],
  );
  return (
    <group>
      <mesh geometry={geometry.minor} position-y={0.04}>
        <meshStandardMaterial color="#14161d" roughness={0.9} />
      </mesh>
      <mesh geometry={geometry.major} position-y={0.05}>
        <meshStandardMaterial color="#181b24" roughness={0.85} />
      </mesh>
      <mesh geometry={geometry.glow} position-y={0.07}>
        <meshBasicMaterial color={[0.35, 0.5, 1.6]} toneMapped={false} />
      </mesh>
    </group>
  );
}
```

- [ ] **Step 5: Create the instanced buildings**

`src/render/Buildings.tsx`:
```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BUILDING_FRAGMENT, BUILDING_VERTEX } from "@/render/buildingShader";
import { type CityLayout, hash01 } from "@/render/layout";

export function Buildings({ layout }: { layout: CityLayout }) {
  const { count } = layout.buildings;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const lit = useMemo(() => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = 0.2 + 0.55 * hash01(i * 7 + 3);
    return out;
  }, [count]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const b = layout.buildings;
    const m = new THREE.Matrix4();
    for (let i = 0; i < b.count; i++) {
      m.makeScale(b.w[i], b.h[i], b.d[i]);
      m.setPosition(b.x[i], 0, b.z[i]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [layout]);

  useFrame((state) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh key={count} ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]}>
        <instancedBufferAttribute attach="attributes-aSeed" args={[layout.buildings.seed, 1]} />
        <instancedBufferAttribute attach="attributes-aLit" args={[lit, 1]} />
      </boxGeometry>
      <shaderMaterial ref={materialRef} uniforms={uniforms} vertexShader={BUILDING_VERTEX} fragmentShader={BUILDING_FRAGMENT} />
    </instancedMesh>
  );
}
```

- [ ] **Step 6: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`.
Expected: clean. These components aren't mounted yet; Task 11 renders them.

- [ ] **Step 7: Commit**

```bash
git add src/render/frame-store.ts src/render/buildingShader.ts src/render/Ground.tsx src/render/Streets.tsx src/render/Buildings.tsx
git commit -m "feat(render): add night ground, streets and lit instanced buildings"
```

---

### Task 10: Landmarks, crowds and the canvas

**Files:** create `src/render/Landmarks.tsx`, `src/render/Crowd.tsx`, `src/render/CityCanvas.tsx`.

- [ ] **Step 1: Create the landmarks**

`src/render/Landmarks.tsx`:
```tsx
"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { type ReactNode, useMemo } from "react";
import type { CityLayout } from "@/render/layout";
import { type Rgb, sceneHues, sceneRgb } from "@/render/palette";
import { type VenueView, venueViews } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { VenueKind, World } from "@/world/schema";

const BODY = "#151821";
const NEUTRAL_SIGN: Rgb = [0.9, 0.85, 0.75];
const CLOSED_SINK = -1.6;

function Body({ kind, sign }: { kind: VenueKind; sign: Rgb }): ReactNode {
  const body = <meshStandardMaterial color={BODY} roughness={0.8} />;
  const neon = <meshBasicMaterial color={sign} toneMapped={false} />;
  switch (kind) {
    case "club":
      return (
        <>
          <mesh position-y={1.2}><boxGeometry args={[3.2, 2.4, 3.2]} />{body}</mesh>
          <mesh position={[0, 2.0, 1.62]}><boxGeometry args={[2.6, 0.3, 0.05]} />{neon}</mesh>
          <mesh position-y={2.45}><boxGeometry args={[3.3, 0.08, 3.3]} />{neon}</mesh>
        </>
      );
    case "bar":
      return (
        <>
          <mesh position-y={0.8}><boxGeometry args={[2.6, 1.6, 2.4]} />{body}</mesh>
          <mesh position={[0, 1.25, 1.45]}><boxGeometry args={[2.8, 0.1, 0.8]} /><meshStandardMaterial color="#3a1f2b" /></mesh>
          <mesh position={[0, 1.45, 1.23]}><boxGeometry args={[1.6, 0.28, 0.05]} />{neon}</mesh>
        </>
      );
    case "cafe":
      return (
        <>
          <mesh position-y={0.65}><cylinderGeometry args={[1.4, 1.4, 1.3, 20]} />{body}</mesh>
          <mesh position-y={1.75}><coneGeometry args={[1.7, 0.9, 20]} />{body}</mesh>
          <mesh position-y={1.3} rotation-x={Math.PI / 2}><torusGeometry args={[1.45, 0.06, 8, 32]} />{neon}</mesh>
        </>
      );
    case "restaurant":
      return (
        <>
          <mesh position-y={0.75}><boxGeometry args={[3.2, 1.5, 2.4]} />{body}</mesh>
          <mesh position-y={2.1} rotation-y={Math.PI / 4}><coneGeometry args={[2.4, 1.2, 4]} />{body}</mesh>
          <mesh position={[0, 1.2, 1.23]}><boxGeometry args={[1.8, 0.3, 0.05]} />{neon}</mesh>
        </>
      );
    case "gallery":
      return (
        <>
          <mesh position-y={1.3}><boxGeometry args={[3, 2.6, 3]} /><meshStandardMaterial color="#2a2d36" roughness={0.6} /></mesh>
          <mesh position-y={0.05}><boxGeometry args={[3.1, 0.06, 3.1]} />{neon}</mesh>
        </>
      );
    case "music_venue":
      return (
        <>
          <mesh rotation-z={Math.PI / 2}><cylinderGeometry args={[2, 2, 5, 20]} />{body}</mesh>
          <mesh position={[0, 1.1, 2.02]}><boxGeometry args={[3, 0.5, 0.05]} />{neon}</mesh>
        </>
      );
    case "shop":
      return (
        <>
          <mesh position-y={0.7}><boxGeometry args={[1.8, 1.4, 1.8]} />{body}</mesh>
          <mesh position={[0, 1.15, 0.93]}><boxGeometry args={[1.2, 0.22, 0.05]} />{neon}</mesh>
        </>
      );
    case "stadium":
      return (
        <>
          <mesh position-y={0.8} rotation-x={Math.PI / 2}><torusGeometry args={[3.4, 1, 10, 32]} />{body}</mesh>
          <mesh position-y={1.6} rotation-x={Math.PI / 2}><torusGeometry args={[4.2, 0.08, 8, 48]} />{neon}</mesh>
        </>
      );
    default:
      return (
        <>
          <mesh position-y={1.1}><boxGeometry args={[2.2, 2.2, 2.2]} />{body}</mesh>
          <mesh position={[0, 1.8, 1.12]}><boxGeometry args={[1.4, 0.26, 0.05]} />{neon}</mesh>
        </>
      );
  }
}

function Landmark({ view, hues, selected, onSelect }: { view: VenueView; hues: Float32Array; selected: boolean; onSelect: (slot: number) => void }) {
  const [x, z] = view.position;
  const [r, g, b] = view.dominantScene >= 0 ? sceneRgb(hues, view.dominantScene) : NEUTRAL_SIGN;
  const glow = view.open ? 0.5 + 2.2 * view.health : 0.04;
  const sign: Rgb = [r * glow, g * glow, b * glow];
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(view.slot);
  };
  return (
    <group position={[x, view.open ? 0 : CLOSED_SINK, z]} onClick={onClick}>
      <Body kind={view.kind} sign={sign} />
      {view.isEvent && view.open && (
        <mesh position-y={12}>
          <cylinderGeometry args={[0.35, 0.35, 24, 12, 1, true]} />
          <meshBasicMaterial color={sign} toneMapped={false} transparent opacity={0.55} />
        </mesh>
      )}
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.06 - (view.open ? 0 : CLOSED_SINK)}>
          <ringGeometry args={[3.6, 4.1, 48]} />
          <meshBasicMaterial color={[2, 2, 2]} toneMapped={false} />
        </mesh>
      )}
    </group>
  );
}

export function Landmarks({
  world, layout, frame, selected, onSelect,
}: {
  world: World;
  layout: CityLayout;
  frame: Frame | null;
  selected: number | null;
  onSelect: (slot: number) => void;
}) {
  const views = useMemo(() => (frame ? venueViews(frame, layout, world) : []), [frame, layout, world]);
  const hues = useMemo(() => (frame ? sceneHues(frame.lineageParents) : new Float32Array(0)), [frame]);
  return (
    <group>
      {views.map((v) => (
        <Landmark key={v.slot} view={v} hues={hues} selected={selected === v.slot} onSelect={onSelect} />
      ))}
    </group>
  );
}
```

- [ ] **Step 2: Create the crowds**

`src/render/Crowd.tsx`:
```tsx
"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { FrameStore } from "@/render/frame-store";
import { agentHomePosition, type CityLayout, hash01 } from "@/render/layout";
import { sceneHues, sceneRgb } from "@/render/palette";
import { venueViews } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

const FIGURE_Y = 0.6;
const GLOW = 1.6;
const scratch = new THREE.Color();

type Motion = {
  fromX: Float32Array;
  fromZ: Float32Array;
  toX: Float32Array;
  toZ: Float32Array;
  curX: Float32Array;
  curZ: Float32Array;
  placed: Uint8Array;
  frame: Frame | null;
  startedAt: number;
};

function createMotion(slots: number): Motion {
  return {
    fromX: new Float32Array(slots),
    fromZ: new Float32Array(slots),
    toX: new Float32Array(slots),
    toZ: new Float32Array(slots),
    curX: new Float32Array(slots),
    curZ: new Float32Array(slots),
    placed: new Uint8Array(slots),
    frame: null,
    startedAt: 0,
  };
}

/** One glowing figure per agent slot: each tick it eases from where it was to its venue (or home). */
export function Crowd({
  world, layout, frames, slots, tickMs,
}: {
  world: World;
  layout: CityLayout;
  frames: RefObject<FrameStore>;
  slots: number;
  tickMs: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const motion = useRef<Motion | null>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < slots; i++) {
      mesh.setMatrixAt(i, hidden);
      mesh.setColorAt(i, black);
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    motion.current = createMotion(slots);
  }, [slots]);

  useFrame(() => {
    const mesh = meshRef.current;
    const m = motion.current;
    const frame = frames.current.current;
    if (!mesh || !m || !frame) return;
    const now = performance.now();
    const n = Math.min(slots, frame.alive.length);

    if (frame !== m.frame) {
      const venues = venueViews(frame, layout, world);
      const hues = sceneHues(frame.lineageParents);
      for (let i = 0; i < n; i++) {
        if (!frame.alive[i]) {
          m.placed[i] = 0;
          continue;
        }
        const v = frame.attendance[i];
        let tx: number;
        let tz: number;
        if (v >= 0 && v < venues.length) {
          const [vx, vz] = venues[v].position;
          const a = hash01(i * 3 + 1) * Math.PI * 2;
          const r = 2.2 + hash01(i * 5 + 2) * 2.5;
          tx = vx + r * Math.cos(a);
          tz = vz + r * Math.sin(a);
        } else {
          [tx, tz] = agentHomePosition(layout, frame.homeCell[i], i);
        }
        if (!m.placed[i]) {
          m.curX[i] = tx;
          m.curZ[i] = tz;
          m.placed[i] = 1;
        }
        m.fromX[i] = m.curX[i];
        m.fromZ[i] = m.curZ[i];
        m.toX[i] = tx;
        m.toZ[i] = tz;
        const [r, g, b] = sceneRgb(hues, frame.scene[i]);
        mesh.setColorAt(i, scratch.setRGB(r * GLOW, g * GLOW, b * GLOW));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      m.frame = frame;
      m.startedAt = now;
    }

    const k = Math.min(1, (now - m.startedAt) / Math.max(1, tickMs * 0.85));
    const e = k * k * (3 - 2 * k);
    const arr = mesh.instanceMatrix.array as Float32Array;
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      if (!frame.alive[i]) {
        arr[o] = 0;
        arr[o + 5] = 0;
        arr[o + 10] = 0;
        continue;
      }
      const x = m.fromX[i] + (m.toX[i] - m.fromX[i]) * e;
      const z = m.fromZ[i] + (m.toZ[i] - m.fromZ[i]) * e;
      m.curX[i] = x;
      m.curZ[i] = z;
      arr[o] = 1;
      arr[o + 5] = 1;
      arr[o + 10] = 1;
      arr[o + 12] = x;
      arr[o + 13] = FIGURE_Y + 0.15 * Math.sin(now * 0.004 + i);
      arr[o + 14] = z;
      arr[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh key={slots} ref={meshRef} args={[undefined, undefined, slots]} frustumCulled={false}>
      <sphereGeometry args={[0.45, 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
```

- [ ] **Step 3: Create the canvas**

`src/render/CityCanvas.tsx`:
```tsx
"use client";

import { MapControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { RefObject } from "react";
import { Buildings } from "@/render/Buildings";
import { Crowd } from "@/render/Crowd";
import type { FrameStore } from "@/render/frame-store";
import { Ground } from "@/render/Ground";
import { Landmarks } from "@/render/Landmarks";
import type { CityLayout } from "@/render/layout";
import { Streets } from "@/render/Streets";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

export type CityCanvasProps = {
  world: World;
  layout: CityLayout;
  frames: RefObject<FrameStore>;
  frame: Frame | null;
  agentSlots: number;
  tickMs: number;
  selectedVenue: number | null;
  onVenueClick: (slot: number) => void;
  onGroundClick: (x: number, z: number) => void;
  cursor: string;
};

export function CityCanvas(props: CityCanvasProps) {
  const { layout } = props;
  const size = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxZ - layout.bounds.minZ);
  const { x, z } = layout.center;
  return (
    <div className="absolute inset-0" style={{ cursor: props.cursor }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: "high-performance" }}
        camera={{ position: [x, size * 0.45, z + size * 0.55], fov: 42, near: 0.5, far: size * 8 }}
      >
        <color attach="background" args={["#07080b"]} />
        <fog attach="fog" args={["#07080b", size * 0.7, size * 2.2]} />
        <ambientLight intensity={0.35} color="#9aa7ff" />
        <directionalLight position={[x + size, size, z + size * 0.4]} intensity={0.6} color="#b8c4ff" />
        <Ground layout={layout} onGroundClick={props.onGroundClick} />
        <Streets layout={layout} />
        <Buildings layout={layout} />
        <Landmarks world={props.world} layout={layout} frame={props.frame} selected={props.selectedVenue} onSelect={props.onVenueClick} />
        <Crowd world={props.world} layout={layout} frames={props.frames} slots={props.agentSlots} tickMs={props.tickMs} />
        <MapControls
          makeDefault
          target={[x, 0, z]}
          enableDamping
          dampingFactor={0.08}
          maxPolarAngle={Math.PI * 0.43}
          minDistance={size * 0.04}
          maxDistance={size * 1.6}
        />
        <EffectComposer>
          <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.55} luminanceSmoothing={0.25} />
          <Vignette offset={0.25} darkness={0.75} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`.
Expected: clean. If a prop name differs in the installed drei or postprocessing version, check the package's `.d.ts` in `node_modules` and adapt, noting the change in your report.

- [ ] **Step 5: Commit**

```bash
git add src/render/Landmarks.tsx src/render/Crowd.tsx src/render/CityCanvas.tsx
git commit -m "feat(render): add venue landmarks, agent crowds and the city canvas"
```

---

### Task 11: Simulation hook, overlay UI and app entry

**Files:**
- Create: `src/ui/demo-world.ts`, `src/ui/useSimulation.ts`, `src/ui/Hud.tsx`, `src/ui/Toolbar.tsx`, `src/ui/TimelineBar.tsx`, `src/ui/VenuePanel.tsx`, `src/ui/GameShell.tsx`, `src/ui/ClientGame.tsx`, `.claude/launch.json`
- Modify: `src/app/page.tsx`, `src/app/layout.tsx`, `src/app/globals.css`

- [ ] **Step 1: Create the demo world and the simulation hook**

`src/ui/demo-world.ts`:
```ts
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import type { World } from "@/world/schema";

/** Synthetic demo city, used until real Qloo worlds exist (Plan 4). */
export function demoWorld(): World {
  return makeTinyWorld({ seed: 7, clusters: 6, entitiesPerCluster: 20, gridSize: 10 });
}
```

`src/ui/useSimulation.ts`:
```ts
"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { FrameStore } from "@/render/frame-store";
import type { Action } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { SimDigest } from "@/sim/digest";
import type { Frame } from "@/sim/frame";
import { SimClient } from "@/sim/worker/client";
import { MAIN_TIMELINE } from "@/sim/worker/protocol";
import type { World } from "@/world/schema";

export type SimStatus = "loading" | "ready" | "error";

export type Simulation = {
  status: SimStatus;
  error: string | null;
  playing: boolean;
  speed: number;
  frame: Frame | null;
  digest: SimDigest | null;
  frames: RefObject<FrameStore>;
  play(): void;
  pause(): void;
  setSpeed(ticksPerSecond: number): void;
  act(action: Action): Promise<void>;
  rewind(tick: number): Promise<void>;
  dismissError(): void;
};

const DEFAULT_SPEED = 2;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Owns the simulation worker: initialises the world, streams frames, and applies user actions. */
export function useSimulation(world: World, seed: number, config: Partial<SimConfig>): Simulation {
  const clientRef = useRef<SimClient | null>(null);
  const frames = useRef<FrameStore>({ current: null, previous: null, receivedAt: 0 });
  const playingRef = useRef(false);
  const speedRef = useRef(DEFAULT_SPEED);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [digest, setDigest] = useState<SimDigest | null>(null);
  const [status, setStatus] = useState<SimStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(DEFAULT_SPEED);

  const accept = useCallback((f: Frame) => {
    frames.current = { previous: frames.current.current, current: f, receivedAt: performance.now() };
    setFrame(f);
    if (f.digest) setDigest(f.digest);
  }, []);

  useEffect(() => {
    const client = SimClient.spawn();
    clientRef.current = client;
    const off = client.onFrame(accept);
    let cancelled = false;
    void (async () => {
      try {
        const init = await client.init(world, seed, config);
        if (cancelled) return;
        setDigest(init.digest);
        const { frame: first } = await client.frame(MAIN_TIMELINE);
        if (cancelled) return;
        accept(first);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(message(e));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      off();
      client.terminate();
      clientRef.current = null;
      playingRef.current = false;
    };
  }, [world, seed, config, accept]);

  const report = useCallback((e: unknown) => setError(message(e)), []);

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const { frame: latest } = await client.frame(MAIN_TIMELINE);
    accept(latest);
  }, [accept]);

  const play = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    playingRef.current = true;
    setPlaying(true);
    client.play(MAIN_TIMELINE, speedRef.current).catch(report);
  }, [report]);

  const pause = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    playingRef.current = false;
    setPlaying(false);
    client.pause().catch(report);
  }, [report]);

  const setSpeed = useCallback(
    (ticksPerSecond: number) => {
      speedRef.current = ticksPerSecond;
      setSpeedState(ticksPerSecond);
      if (playingRef.current) clientRef.current?.play(MAIN_TIMELINE, ticksPerSecond).catch(report);
    },
    [report],
  );

  const act = useCallback(
    async (action: Action) => {
      const client = clientRef.current;
      if (!client) return;
      try {
        setError(null);
        await client.act(MAIN_TIMELINE, action);
        if (!playingRef.current) {
          const result = await client.run(MAIN_TIMELINE, 1);
          setDigest(result.digest);
          await refresh();
        }
      } catch (e) {
        report(e);
      }
    },
    [refresh, report],
  );

  const rewind = useCallback(
    async (tick: number) => {
      const client = clientRef.current;
      if (!client) return;
      try {
        const result = await client.rewind(MAIN_TIMELINE, tick);
        setDigest(result.digest);
        await refresh();
      } catch (e) {
        report(e);
      }
    },
    [refresh, report],
  );

  const dismissError = useCallback(() => setError(null), []);

  return { status, error, playing, speed, frame, digest, frames, play, pause, setSpeed, act, rewind, dismissError };
}
```

- [ ] **Step 2: Create the overlay components**

`src/ui/Hud.tsx`:
```tsx
import type { SimDigest } from "@/sim/digest";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-zinc-400">{label}</p>
      <p className="font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

export function Hud({ city, digest, tick }: { city: string; digest: SimDigest | null; tick: number }) {
  return (
    <header className="panel pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-5 px-4 py-2">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">Genus Loci</p>
        <p className="text-lg font-medium">{city}</p>
      </div>
      <Stat label="Week" value={tick} />
      <Stat label="Residents" value={digest?.agents ?? "—"} />
      <Stat label="Venues" value={digest ? `${digest.venues.open} open · ${digest.venues.closed} closed` : "—"} />
      <Stat label="Events" value={digest?.venues.events ?? "—"} />
      <Stat label="Scenes" value={digest?.scenes.length ?? "—"} />
      <Stat label="Fidelity" value={digest ? digest.fidelity.toFixed(2) : "—"} />
    </header>
  );
}
```

`src/ui/Toolbar.tsx`:
```tsx
"use client";

import { useMemo, useState } from "react";
import type { World } from "@/world/schema";

export type Tool = { kind: "select" } | { kind: "open"; entity: number } | { kind: "event"; entity: number };

function ToolButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
        active ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/50" : "hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

export function Toolbar({ world, tool, onTool }: { world: World; tool: Tool; onTool: (tool: Tool) => void }) {
  const places = useMemo(() => world.entities.flatMap((e, i) => (e.type === "place" ? [{ i, name: e.name }] : [])), [world]);
  const artists = useMemo(() => world.entities.flatMap((e, i) => (e.type === "artist" ? [{ i, name: e.name }] : [])), [world]);
  const [place, setPlace] = useState(places[0]?.i ?? -1);
  const [artist, setArtist] = useState(artists[0]?.i ?? -1);
  const select = "w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs";

  return (
    <aside className="panel pointer-events-auto absolute left-4 top-24 w-60 space-y-3 p-3">
      <ToolButton active={tool.kind === "select"} label="Select" onClick={() => onTool({ kind: "select" })} />
      <div className="space-y-1">
        <ToolButton active={tool.kind === "open"} label="Open a venue" onClick={() => place >= 0 && onTool({ kind: "open", entity: place })} />
        <select
          aria-label="Place to open"
          className={select}
          value={place}
          onChange={(e) => {
            const v = Number(e.target.value);
            setPlace(v);
            if (tool.kind === "open") onTool({ kind: "open", entity: v });
          }}
        >
          {places.map((p) => <option key={p.i} value={p.i}>{p.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <ToolButton active={tool.kind === "event"} label="Throw an event" onClick={() => artist >= 0 && onTool({ kind: "event", entity: artist })} />
        <select
          aria-label="Headliner"
          className={select}
          value={artist}
          onChange={(e) => {
            const v = Number(e.target.value);
            setArtist(v);
            if (tool.kind === "event") onTool({ kind: "event", entity: v });
          }}
        >
          {artists.map((a) => <option key={a.i} value={a.i}>{a.name}</option>)}
        </select>
      </div>
      {tool.kind !== "select" && <p className="text-xs text-amber-200">Click the map to place it. Esc cancels.</p>}
    </aside>
  );
}
```

`src/ui/TimelineBar.tsx`:
```tsx
"use client";

import { useState } from "react";

const SPEEDS = [1, 2, 4, 8];

export function TimelineBar({
  tick, earliest, playing, speed, onPlay, onPause, onSpeed, onRewind,
}: {
  tick: number;
  earliest: number;
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (ticksPerSecond: number) => void;
  onRewind: (tick: number) => void;
}) {
  const [scrub, setScrub] = useState<number | null>(null);
  const value = scrub ?? tick;
  const commit = () => {
    if (scrub !== null && scrub !== tick) onRewind(scrub);
    setScrub(null);
  };
  return (
    <footer className="panel pointer-events-auto absolute bottom-4 left-1/2 flex w-[min(760px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 p-3">
      <button
        type="button"
        onClick={playing ? onPause : onPlay}
        className="w-20 rounded-lg bg-violet-500/25 py-2 text-sm font-medium text-violet-100 ring-1 ring-violet-400/40 hover:bg-violet-500/35"
      >
        {playing ? "Pause" : "Play"}
      </button>
      <div className="flex gap-1" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeed(s)}
            aria-pressed={s === speed}
            className={`rounded-md px-2 py-1 text-xs ${s === speed ? "bg-white/15" : "hover:bg-white/5"}`}
          >
            {s}×
          </button>
        ))}
      </div>
      <input
        type="range"
        aria-label="Rewind to week"
        className="flex-1 accent-violet-400"
        min={earliest}
        max={Math.max(tick, earliest)}
        value={value}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <span className="w-20 text-right font-mono text-sm tabular-nums">Week {value}</span>
    </footer>
  );
}
```

`src/ui/VenuePanel.tsx`:
```tsx
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

export function VenuePanel({
  world, frame, slot, onCloseVenue, onDismiss,
}: {
  world: World;
  frame: Frame | null;
  slot: number | null;
  onCloseVenue: (slot: number) => void;
  onDismiss: () => void;
}) {
  if (slot === null || !frame || slot >= frame.nVenues) return null;
  const entity = world.entities[frame.venueEntity[slot]];
  const open = frame.venueOpen[slot] === 1;
  const isEvent = frame.venueExpires[slot] >= 0;
  return (
    <aside className="panel pointer-events-auto absolute right-4 top-24 w-72 space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-400">{isEvent ? "Event" : (entity.kind ?? "venue").replace("_", " ")}</p>
          <h2 className="text-lg font-medium leading-tight">{entity.name}</h2>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Close panel" className="rounded px-2 text-zinc-400 hover:bg-white/10">×</button>
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-zinc-400">Status</dt>
        <dd>{open ? "Open" : "Closed"}</dd>
        <dt className="text-zinc-400">Health</dt>
        <dd className="font-mono tabular-nums">{Math.round(frame.venueHealth[slot] * 100)}%</dd>
        <dt className="text-zinc-400">Visitors this week</dt>
        <dd className="font-mono tabular-nums">{frame.venueAttendance[slot]}</dd>
      </dl>
      {open && !isEvent && (
        <button
          type="button"
          onClick={() => onCloseVenue(slot)}
          className="w-full rounded-lg border border-rose-400/40 bg-rose-500/15 py-2 text-sm text-rose-100 hover:bg-rose-500/25"
        >
          Close venue
        </button>
      )}
    </aside>
  );
}
```

- [ ] **Step 3: Compose the game**

`src/ui/GameShell.tsx`:
```tsx
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CityCanvas } from "@/render/CityCanvas";
import { buildLayout, nearestCell } from "@/render/layout";
import type { SimConfig } from "@/sim/config";
import { demoWorld } from "@/ui/demo-world";
import { Hud } from "@/ui/Hud";
import { TimelineBar } from "@/ui/TimelineBar";
import { type Tool, Toolbar } from "@/ui/Toolbar";
import { useSimulation } from "@/ui/useSimulation";
import { VenuePanel } from "@/ui/VenuePanel";

const DEMO_SEED = 7;
const DEMO_CONFIG: Partial<SimConfig> = { nAgents: 4000, agentReserve: 500 };
const AGENT_SLOTS = 4500;
const EVENT = { duration: 3, reachKm: 25, capacity: 3000 } as const;

export default function GameShell() {
  const world = useMemo(() => demoWorld(), []);
  const layout = useMemo(() => buildLayout(world), [world]);
  const sim = useSimulation(world, DEMO_SEED, DEMO_CONFIG);
  const { act } = sim;
  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTool({ kind: "select" });
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onGroundClick = useCallback(
    (x: number, z: number) => {
      const cell = nearestCell(layout, x, z);
      if (tool.kind === "open") {
        void act({ type: "openVenue", entity: tool.entity, cell });
        setTool({ kind: "select" });
      } else if (tool.kind === "event") {
        void act({ type: "scheduleEvent", entity: tool.entity, cell, ...EVENT });
        setTool({ kind: "select" });
      } else {
        setSelected(null);
      }
    },
    [act, layout, tool],
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#07080b] text-zinc-100">
      <CityCanvas
        world={world}
        layout={layout}
        frames={sim.frames}
        frame={sim.frame}
        agentSlots={AGENT_SLOTS}
        tickMs={1000 / sim.speed}
        selectedVenue={selected}
        onVenueClick={setSelected}
        onGroundClick={onGroundClick}
        cursor={tool.kind === "select" ? "default" : "crosshair"}
      />
      <Hud city={world.city.name} digest={sim.digest} tick={sim.frame?.tick ?? 0} />
      <Toolbar world={world} tool={tool} onTool={setTool} />
      <VenuePanel
        world={world}
        frame={sim.frame}
        slot={selected}
        onCloseVenue={(venue) => void act({ type: "closeVenue", venue })}
        onDismiss={() => setSelected(null)}
      />
      <TimelineBar
        tick={sim.frame?.tick ?? 0}
        earliest={sim.frame?.earliestTick ?? 0}
        playing={sim.playing}
        speed={sim.speed}
        onPlay={sim.play}
        onPause={sim.pause}
        onSpeed={sim.setSpeed}
        onRewind={(t) => void sim.rewind(t)}
      />
      {sim.status === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-zinc-400">Growing the city…</div>
      )}
      {sim.error && (
        <div role="alert" className="pointer-events-auto absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border border-rose-400/40 bg-rose-950/80 px-4 py-2 text-sm text-rose-100">
          {sim.error}
          <button type="button" onClick={sim.dismissError} className="ml-3 underline">Dismiss</button>
        </div>
      )}
    </div>
  );
}
```
`AGENT_SLOTS` must equal `nAgents + agentReserve` in `DEMO_CONFIG`; keep them in sync.

`src/ui/ClientGame.tsx`:
```tsx
"use client";

import dynamic from "next/dynamic";

const GameShell = dynamic(() => import("@/ui/GameShell"), {
  ssr: false,
  loading: () => <div className="grid h-dvh place-items-center bg-[#07080b] text-zinc-400">Growing the city…</div>,
});

export default function ClientGame() {
  return <GameShell />;
}
```

- [ ] **Step 4: Wire up the app entry**

Replace `src/app/page.tsx` with:
```tsx
import ClientGame from "@/ui/ClientGame";

export default function Home() {
  return (
    <main className="h-dvh w-full">
      <ClientGame />
    </main>
  );
}
```

In `src/app/layout.tsx`, replace the `metadata` object with:
```ts
export const metadata: Metadata = {
  title: "Genus Loci",
  description: "Agent-based artificial life on Qloo's taste graph: a city's scenes evolve while you intervene.",
};
```

Replace `src/app/globals.css` with:
```css
@import "tailwindcss";

@theme inline {
  --font-sans: var(--font-geist-sans);
  --font-mono: var(--font-geist-mono);
}

@utility panel {
  border-radius: 0.75rem;
  border: 1px solid rgb(255 255 255 / 0.1);
  background: rgb(8 9 13 / 0.62);
  backdrop-filter: blur(12px);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.35);
}

html,
body {
  background: #07080b;
  color: #e4e4e7;
}
```

Create `.claude/launch.json`:
```json
{
  "version": "0.0.1",
  "configurations": [
    { "name": "web", "runtimeExecutable": "pnpm", "runtimeArgs": ["dev"], "port": 3000 }
  ]
}
```

- [ ] **Step 5: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`.
Expected: everything passes. The build must succeed, which proves Turbopack bundles `new Worker(new URL("./sim.worker.ts", import.meta.url))`. If it doesn't, read `node_modules/next/dist/docs/01-app/03-api-reference/08-turbopack.md` and report before working around it.

- [ ] **Step 6: Commit**

```bash
git add src/ui src/app .claude/launch.json
git commit -m "feat(ui): add playable city with simulation hook, toolbar, timeline and HUD"
```

---

### Task 12: Browser verification and handoff docs (controller)

- [ ] **Step 1:** Start the dev server via the browser preview (`.claude/launch.json` → `web`) and open `/`. Check for console errors and take a screenshot. Then:
  - Press Play: the week advances and crowds move.
  - Change speed.
  - Click a landmark: the venue panel appears, and Close venue makes the landmark sink and go dark.
  - Use Open a venue and click the map: a new landmark appears.
  - Use Throw an event: a light pillar appears and crowds converge on it.
  - Drag the rewind slider back: the city state rewinds.
  - Fix what's broken, each fix with its own commit.
- [ ] **Step 2:** Update `docs/architecture.md` with the `render/` and `ui/` components and the `pnpm dev` / browser preview notes. Update `docs/current-state.md` (Plan 5a done, observations, next: 5b) and the roadmap status. Commit: `docs: record Plan 5a completion`.
