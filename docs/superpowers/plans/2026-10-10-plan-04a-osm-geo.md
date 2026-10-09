# Plan 4a: Real Streets from OpenStreetMap — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a real city (London first) in the game. Real roads, water and parks come from OpenStreetMap. A synthetic population, scenes and venues are laid over the real geography until Qloo data replaces them in Plan 4.

**Architecture:**
- **Fetch once:** a CLI script queries the Overpass API (free, no key) once per city. It projects, classifies, clips and simplifies the geometry into the World `geo` format, and writes `public/geo/<city>.json`. That is a geo file with attribution metadata, licensed ODbL (decision 0006).
- **Pure modules, unit-tested on synthetic fixtures:** geometry utilities, the Overpass parser, and the synthetic-city generator.
- **In the app:** the UI fetches the geo file, builds the World on the client, and falls back to Synthville if loading fails. OSM attribution is always shown.

**Tech Stack:** TypeScript, zod, Vitest, tsx (CLI), Next.js 16.

**Context:**
- The spec is [../specs/2026-10-09-genusloci-ui-design.md](../specs/2026-10-09-genusloci-ui-design.md).
- Decision 0005 covers the diorama with real streets.
- The roadmap row is Plan 4 (World builder). This plan is its key-independent OSM half.

**Rules:**
- Atomic commits in Conventional Commits format; end each message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `pnpm test`, `pnpm exec tsc --noEmit` and `pnpm lint` before each commit (add `pnpm build` for UI tasks).
- Keep LF line endings (use the Edit/Write tools).
- **Overpass etiquette:** one request per city build, a descriptive `User-Agent`, and no automated retries in a loop.

---

## File structure

| File | Responsibility | Status |
|---|---|---|
| `src/geo/geometry.ts` | `pointInPolygon`, `simplify` (Douglas–Peucker), `clipPolyline`, `clipPolygon`, `assembleRings` | new |
| `src/geo/overpass.ts` | `buildOverpassQuery`, `parseOverpass` → `Geo` | new |
| `src/geo/cities.ts` | City registry (centre, radius) | new |
| `src/geo/geo-file.ts` | `GeoFileSchema` (the file format in `public/geo`) | new |
| `src/world/projection.ts` | Add `fromLocalMetres` (inverse) | modify |
| `src/world/fixtures/synthetic-city.ts` | `makeSyntheticCity(geoFile)` → World over real geography | new |
| `src/render/layout.ts` | Reuse `pointInPolygon` from `geo/geometry` | modify |
| `scripts/build-geo.ts` | CLI: Overpass → `public/geo/<city>.json` | new |
| `public/geo/london.json`, `public/geo/README.md` | London geometry and its ODbL notice | new (generated) |
| `src/ui/useCityWorld.ts` | Loads the geo file and builds the world, with fallback | new |
| `src/ui/GameShell.tsx`, `src/ui/Attribution.tsx` | Async world plus OSM attribution | modify / new |
| `docs/decisions/0006-osm-geometry.md` | Decision record | new |

---

### Task 1: Geometry utilities

**Files:** create `src/geo/geometry.ts`; test `src/geo/geometry.test.ts`; modify `src/render/layout.ts`.

- [ ] **Step 1: Write the failing test**

`src/geo/geometry.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { assembleRings, clipPolygon, clipPolyline, type Pt, pointInPolygon, simplify } from "@/geo/geometry";

const rect = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

describe("simplify", () => {
  it("drops near-collinear points and keeps the ends", () => {
    const line: Pt[] = [[0, 0], [5, 0.1], [10, 0], [10, 10]];
    expect(simplify(line, 1)).toEqual([[0, 0], [10, 0], [10, 10]]);
  });
  it("keeps short lines as they are", () => {
    expect(simplify([[0, 0], [1, 1]], 5)).toEqual([[0, 0], [1, 1]]);
  });
});

describe("clipPolyline", () => {
  it("keeps inside lines, cuts crossing lines and splits re-entering lines", () => {
    expect(clipPolyline([[1, 1], [9, 9]], rect)).toEqual([[[1, 1], [9, 9]]]);
    expect(clipPolyline([[-5, 5], [5, 5]], rect)).toEqual([[[0, 5], [5, 5]]]);
    const split = clipPolyline([[2, 5], [20, 5], [20, 8], [2, 8]], rect);
    expect(split).toEqual([[[2, 5], [10, 5]], [[10, 8], [2, 8]]]);
    expect(clipPolyline([[20, 20], [30, 30]], rect)).toEqual([]);
  });
});

describe("clipPolygon", () => {
  it("clips a polygon to the rectangle and drops polygons outside", () => {
    const clipped = clipPolygon([[-5, -5], [5, -5], [5, 5], [-5, 5]], rect);
    expect(clipped).not.toBeNull();
    const xs = (clipped ?? []).map((p) => p[0]);
    expect(Math.min(...xs)).toBe(0);
    expect(Math.max(...xs)).toBe(5);
    expect(clipPolygon([[20, 20], [30, 20], [30, 30]], rect)).toBeNull();
  });
});

describe("assembleRings", () => {
  it("joins ways that share endpoints into closed rings, reversing where needed", () => {
    const rings = assembleRings([
      [[0, 0], [10, 0]],
      [[10, 10], [10, 0]],
      [[10, 10], [0, 10], [0, 0]],
    ]);
    expect(rings).toHaveLength(1);
    expect(rings[0][0]).toEqual(rings[0][rings[0].length - 1]);
    expect(rings[0]).toHaveLength(5);
  });
  it("drops chains that never close", () => {
    expect(assembleRings([[[0, 0], [1, 0]], [[5, 5], [6, 6]]])).toEqual([]);
  });
});

describe("pointInPolygon", () => {
  it("uses even-odd ray casting", () => {
    const sq: Pt[] = [[0, 0], [2, 0], [2, 2], [0, 2]];
    expect(pointInPolygon(1, 1, sq)).toBe(true);
    expect(pointInPolygon(3, 1, sq)).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/geo/geometry.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/geo/geometry.ts`:
```ts
export type Pt = [number, number];
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

/** Even-odd ray casting. */
export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker simplification (iterative); always keeps the endpoints. */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop() as [number, number];
    let worst = -1;
    let worstD = tolerance;
    for (let i = s + 1; i < e; i++) {
      const d = segmentDistance(points[i], points[s], points[e]);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([s, worst], [worst, e]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Liang–Barsky: the part of segment a→b inside rect, or null. */
function clipSegment(a: Pt, b: Pt, r: Rect): [Pt, Pt] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a[0] - r.minX],
    [dx, r.maxX - a[0]],
    [-dy, a[1] - r.minY],
    [dy, r.maxY - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

const same = (p: Pt, q: Pt) => p[0] === q[0] && p[1] === q[1];

/** Clips a polyline to rect, returning the inside pieces (a line that leaves and re-enters becomes several). */
export function clipPolyline(points: Pt[], rect: Rect): Pt[][] {
  const out: Pt[][] = [];
  let current: Pt[] | null = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const seg = clipSegment(points[i], points[i + 1], rect);
    if (!seg) {
      current = null;
      continue;
    }
    if (current && same(current[current.length - 1], seg[0])) current.push(seg[1]);
    else {
      current = [seg[0], seg[1]];
      out.push(current);
    }
    if (!same(seg[1], points[i + 1])) current = null;
  }
  return out.filter((line) => line.length >= 2 && !(line.length === 2 && same(line[0], line[1])));
}

/** Sutherland–Hodgman clip of a ring to rect; null if fewer than 3 points remain. */
export function clipPolygon(ring: Pt[], rect: Rect): Pt[] | null {
  type Edge = { inside: (p: Pt) => boolean; cross: (a: Pt, b: Pt) => Pt };
  const lerpX = (a: Pt, b: Pt, x: number): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const lerpY = (a: Pt, b: Pt, y: number): Pt => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  const edges: Edge[] = [
    { inside: (p) => p[0] >= rect.minX, cross: (a, b) => lerpX(a, b, rect.minX) },
    { inside: (p) => p[0] <= rect.maxX, cross: (a, b) => lerpX(a, b, rect.maxX) },
    { inside: (p) => p[1] >= rect.minY, cross: (a, b) => lerpY(a, b, rect.minY) },
    { inside: (p) => p[1] <= rect.maxY, cross: (a, b) => lerpY(a, b, rect.maxY) },
  ];
  let poly = ring.length > 1 && same(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring.slice();
  for (const edge of edges) {
    const next: Pt[] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      if (edge.inside(cur)) {
        if (!edge.inside(prev)) next.push(edge.cross(prev, cur));
        next.push(cur);
      } else if (edge.inside(prev)) {
        next.push(edge.cross(prev, cur));
      }
    }
    poly = next;
    if (poly.length === 0) break;
  }
  return poly.length >= 3 ? poly : null;
}

const key = (p: Pt) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

/** Joins open ways that share endpoints into closed rings (multipolygon members); unclosed chains are dropped. */
export function assembleRings(ways: Pt[][]): Pt[][] {
  const rings: Pt[][] = [];
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  while (pool.length > 0) {
    let ring = pool.shift() as Pt[];
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      const end = key(ring[ring.length - 1]);
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        if (key(w[0]) === end) ring = ring.concat(w.slice(1));
        else if (key(w[w.length - 1]) === end) ring = ring.concat(w.slice(0, -1).reverse());
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}
```

- [ ] **Step 4: Reuse the geometry in the layout.** In `src/render/layout.ts`, delete the local `pointInPolygon` function. Add:
```ts
import { pointInPolygon as pointInRing } from "@/geo/geometry";

/** Even-odd point-in-polygon on scene x/z (re-exported from the shared geometry module). */
export function pointInPolygon(x: number, z: number, poly: XZ[]): boolean {
  return pointInRing(x, z, poly);
}
```

- [ ] **Step 5: Run the tests**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.
Expected: all pass, including the 8 new geometry tests and the unchanged layout tests.

- [ ] **Step 6: Commit**

```bash
git add src/geo/geometry.ts src/geo/geometry.test.ts src/render/layout.ts
git commit -m "feat(geo): add simplify, clip and ring-assembly geometry utilities"
```

---

### Task 2: Overpass query and parser

**Files:** create `src/geo/overpass.ts`, `src/geo/geo-file.ts`, `src/geo/cities.ts`; test `src/geo/overpass.test.ts`; modify `src/world/projection.ts`.

- [ ] **Step 1: Write the failing test**

`src/geo/overpass.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import { CITIES } from "@/geo/cities";
import { buildOverpassQuery, parseOverpass } from "@/geo/overpass";
import { fromLocalMetres, toLocalMetres } from "@/world/projection";

const centre = { lat: 51.5, lon: -0.1 };
const radiusM = 1000;
// Synthetic Overpass-shaped response (not real OSM data).
const at = (x: number, y: number) => {
  const p = fromLocalMetres({ x, y }, centre);
  return { lat: p.lat, lon: p.lon };
};
const response = {
  elements: [
    { type: "way", id: 1, tags: { highway: "primary" }, geometry: [at(-2000, 0), at(0, 0), at(500, 0)] },
    { type: "way", id: 2, tags: { highway: "residential" }, geometry: [at(0, -300), at(0, 300)] },
    { type: "way", id: 3, tags: { highway: "footway" }, geometry: [at(100, 100), at(200, 200)] },
    { type: "way", id: 4, tags: { leisure: "park" }, geometry: [at(100, 100), at(300, 100), at(300, 300), at(100, 300), at(100, 100)] },
    {
      type: "relation",
      id: 5,
      tags: { natural: "water", type: "multipolygon" },
      members: [
        { type: "way", role: "outer", geometry: [at(-500, -500), at(500, -500)] },
        { type: "way", role: "outer", geometry: [at(500, -400), at(500, -500)] },
        { type: "way", role: "outer", geometry: [at(500, -400), at(-500, -400), at(-500, -500)] },
        { type: "way", role: "inner", geometry: [at(0, -450), at(10, -450), at(10, -440), at(0, -450)] },
      ],
    },
  ],
};

describe("projection round trip", () => {
  it("fromLocalMetres inverts toLocalMetres", () => {
    const p = toLocalMetres(fromLocalMetres({ x: 123, y: -456 }, centre), centre);
    expect(p.x).toBeCloseTo(123, 6);
    expect(p.y).toBeCloseTo(-456, 6);
  });
});

describe("buildOverpassQuery", () => {
  it("asks for roads, water and parks in the bbox as JSON with geometry", () => {
    const q = buildOverpassQuery(centre, radiusM);
    expect(q).toContain("[out:json]");
    expect(q).toContain("out geom");
    expect(q).toMatch(/highway/);
    expect(q).toMatch(/natural"="water/);
    expect(q).toMatch(/leisure/);
  });
});

describe("parseOverpass", () => {
  const geo = parseOverpass(response, centre, radiusM);

  it("bounds the square around the centre", () => {
    expect(geo.bounds).toEqual({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 });
  });

  it("classifies and clips roads, ignoring footways", () => {
    expect(geo.roads.map((r) => r.kind).sort()).toEqual(["major", "minor"]);
    const major = geo.roads.find((r) => r.kind === "major");
    expect(major?.points[0][0]).toBeCloseTo(-1000, 0);
    for (const r of geo.roads) for (const [x, y] of r.points) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1000.01);
      expect(Math.abs(y)).toBeLessThanOrEqual(1000.01);
    }
  });

  it("assembles multipolygon water and keeps closed-way parks", () => {
    expect(geo.water).toHaveLength(1);
    expect(geo.parks).toHaveLength(1);
    expect(geo.water[0].length).toBeGreaterThanOrEqual(3);
  });

  it("rejects a malformed response", () => {
    expect(() => parseOverpass({ nope: true }, centre, radiusM)).toThrow();
  });

  it("knows London", () => {
    expect(CITIES.london.name).toBe("London");
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/geo/overpass.test.ts`
Expected: FAIL. The modules and `fromLocalMetres` are missing.

- [ ] **Step 3: Add the inverse projection** to `src/world/projection.ts`:
```ts
/** Inverse of toLocalMetres. */
export function fromLocalMetres(p: LocalPoint, origin: LatLon): LatLon {
  return {
    lat: origin.lat + p.y / METRES_PER_DEG_LAT,
    lon: origin.lon + p.x / (METRES_PER_DEG_LON_AT_EQUATOR * Math.cos((origin.lat * Math.PI) / 180)),
  };
}
```

- [ ] **Step 4: Create the city registry and the geo-file schema**

`src/geo/cities.ts`:
```ts
export type CitySpec = { slug: string; name: string; lat: number; lon: number; radiusM: number };

/** Cities with prebuilt geometry in public/geo. The radius is half the side of the square area. */
export const CITIES = {
  london: { slug: "london", name: "London", lat: 51.5072, lon: -0.1276, radiusM: 3000 },
} satisfies Record<string, CitySpec>;

export type CitySlug = keyof typeof CITIES;
```

`src/geo/geo-file.ts`:
```ts
import { z } from "zod";
import { GeoSchema } from "@/world/schema";

/** A city's geometry as stored in public/geo/<slug>.json (OpenStreetMap-derived, ODbL). */
export const GeoFileSchema = z.object({
  version: z.literal(1),
  city: z.object({ slug: z.string(), name: z.string(), lat: z.number(), lon: z.number() }),
  radiusM: z.number().positive(),
  attribution: z.string(),
  fetchedAt: z.string(),
  geo: GeoSchema,
});

export type GeoFile = z.infer<typeof GeoFileSchema>;
```

- [ ] **Step 5: Implement the query and parser**

`src/geo/overpass.ts`:
```ts
import { z } from "zod";
import { assembleRings, clipPolygon, clipPolyline, type Pt, type Rect, simplify } from "@/geo/geometry";
import { type LatLon, toLocalMetres } from "@/world/projection";
import type { Geo } from "@/world/schema";

const MAJOR = new Set([
  "motorway", "trunk", "primary", "secondary", "tertiary",
  "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
]);
const MINOR = new Set(["residential", "unclassified", "living_street", "pedestrian"]);
const PARK_LEISURE = new Set(["park", "garden"]);
const PARK_LANDUSE = new Set(["grass", "recreation_ground", "village_green"]);
/** Simplification tolerance in metres. */
const SIMPLIFY_M = { road: 3, area: 6 };

const LatLonSchema = z.object({ lat: z.number(), lon: z.number() });
const OverpassSchema = z.object({
  elements: z.array(
    z.object({
      type: z.string(),
      id: z.number(),
      tags: z.record(z.string(), z.string()).optional(),
      geometry: z.array(LatLonSchema).optional(),
      members: z
        .array(z.object({ type: z.string(), role: z.string(), geometry: z.array(LatLonSchema).optional() }))
        .optional(),
    }),
  ),
});

/** Bounding box (south, west, north, east) of the square of half-side radiusM around centre. */
function bbox(centre: LatLon, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 110_540;
  const dLon = radiusM / (111_320 * Math.cos((centre.lat * Math.PI) / 180));
  return [centre.lat - dLat, centre.lon - dLon, centre.lat + dLat, centre.lon + dLon];
}

/** Overpass QL for drivable streets, water bodies and parks in the square around `centre`. */
export function buildOverpassQuery(centre: LatLon, radiusM: number): string {
  const b = bbox(centre, radiusM).map((v) => v.toFixed(6)).join(",");
  const highways = [...MAJOR, ...MINOR].join("|");
  return `[out:json][timeout:180];
(
  way["highway"~"^(${highways})$"](${b});
  way["natural"="water"](${b});
  way["waterway"="riverbank"](${b});
  relation["natural"="water"](${b});
  way["leisure"~"^(park|garden)$"](${b});
  relation["leisure"="park"](${b});
  way["landuse"~"^(grass|recreation_ground|village_green)$"](${b});
);
out geom;`;
}

const round = (p: Pt): Pt => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];

/** Converts an Overpass `out geom` response into the World geo section (local metres, clipped, simplified). */
export function parseOverpass(json: unknown, centre: LatLon, radiusM: number): Geo {
  const { elements } = OverpassSchema.parse(json);
  const rect: Rect = { minX: -radiusM, minY: -radiusM, maxX: radiusM, maxY: radiusM };
  const project = (g: { lat: number; lon: number }[]): Pt[] =>
    g.map((p) => {
      const l = toLocalMetres(p, centre);
      return [l.x, l.y];
    });

  const roads: Geo["roads"] = [];
  const water: Geo["water"] = [];
  const parks: Geo["parks"] = [];
  const addArea = (target: Geo["water"], ring: Pt[]) => {
    const clipped = clipPolygon(simplify(ring, SIMPLIFY_M.area), rect);
    if (clipped) target.push(clipped.map(round));
  };
  const areaTarget = (tags: Record<string, string>) => {
    if (tags.natural === "water" || tags.waterway === "riverbank") return water;
    if (PARK_LEISURE.has(tags.leisure ?? "") || PARK_LANDUSE.has(tags.landuse ?? "")) return parks;
    return null;
  };

  for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.type === "way" && el.geometry && el.geometry.length >= 2) {
      const points = project(el.geometry);
      const highway = tags.highway ?? "";
      const kind = MAJOR.has(highway) ? "major" : MINOR.has(highway) ? "minor" : null;
      if (kind) {
        for (const piece of clipPolyline(simplify(points, SIMPLIFY_M.road), rect)) {
          roads.push({ kind, points: piece.map(round) });
        }
        continue;
      }
      const target = areaTarget(tags);
      const closed = points.length >= 4 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];
      if (target && closed) addArea(target, points);
    } else if (el.type === "relation" && el.members) {
      const target = areaTarget(tags);
      if (!target) continue;
      const outers = el.members
        .filter((m) => m.type === "way" && m.role === "outer" && m.geometry && m.geometry.length >= 2)
        .map((m) => project(m.geometry ?? []));
      for (const ring of assembleRings(outers)) addArea(target, ring);
    }
  }
  return { bounds: { minX: -radiusM, minY: -radiusM, maxX: radiusM, maxY: radiusM }, roads, water, parks };
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/geo src/world/projection.ts
git commit -m "feat(geo): parse OpenStreetMap roads, water and parks from Overpass"
```

---

### Task 3: Synthetic city over real geography

**Files:** create `src/world/fixtures/synthetic-city.ts`; test `src/world/fixtures/synthetic-city.test.ts`.

- [ ] **Step 1: Write the failing test**

`src/world/fixtures/synthetic-city.test.ts`:
```ts
import { describe, expect, it } from "vitest";
import type { GeoFile } from "@/geo/geo-file";
import { pointInPolygon } from "@/geo/geometry";
import { makeSyntheticCity } from "@/world/fixtures/synthetic-city";
import { toLocalMetres } from "@/world/projection";
import { parseWorld } from "@/world/schema";

// Synthetic geo file: a dense street grid in the west half, a lake in the east.
const roads: GeoFile["geo"]["roads"] = [];
for (let x = -1500; x <= 0; x += 100) roads.push({ kind: "minor", points: [[x, -1500], [x, 1500]] });
for (let y = -1500; y <= 1500; y += 100) roads.push({ kind: "minor", points: [[-1500, y], [0, y]] });
roads.push({ kind: "major", points: [[-1500, 0], [1500, 0]] });
const file: GeoFile = {
  version: 1,
  city: { slug: "testopolis", name: "Testopolis", lat: 51.5, lon: -0.1 },
  radiusM: 1500,
  attribution: "test",
  fetchedAt: "2026-10-10T00:00:00Z",
  geo: {
    bounds: { minX: -1500, minY: -1500, maxX: 1500, maxY: 1500 },
    roads,
    water: [[[600, 600], [1400, 600], [1400, 1400], [600, 1400]]],
    parks: [],
  },
};

describe("makeSyntheticCity", () => {
  const world = makeSyntheticCity(file);

  it("produces a schema-valid world carrying the real geo and city", () => {
    expect(() => parseWorld(world)).not.toThrow();
    expect(world.city.name).toBe("Testopolis");
    expect(world.geo).toEqual(file.geo);
  });

  it("is deterministic", () => {
    expect(makeSyntheticCity(file)).toEqual(world);
  });

  it("puts no cells in water", () => {
    for (const c of world.cells) {
      const p = toLocalMetres(c, file.city);
      expect(pointInPolygon(p.x, p.y, file.geo.water[0])).toBe(false);
    }
  });

  it("makes street-dense areas denser", () => {
    const west = world.cells.filter((c) => toLocalMetres(c, file.city).x < -200);
    const east = world.cells.filter((c) => toLocalMetres(c, file.city).x > 200);
    const mean = (cs: typeof west) => cs.reduce((a, c) => a + c.density, 0) / cs.length;
    expect(mean(west)).toBeGreaterThan(mean(east));
  });

  it("places every venue in a valid cell with a kind", () => {
    const venues = world.entities.filter((e) => e.type === "place");
    expect(venues.length).toBeGreaterThan(10);
    for (const v of venues) {
      expect(v.cell).toBeLessThan(world.cells.length);
      expect(v.kind).toBeDefined();
    }
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test src/world/fixtures/synthetic-city.test.ts`
Expected: FAIL. The module cannot be resolved.

- [ ] **Step 3: Implement**

`src/world/fixtures/synthetic-city.ts`:
```ts
import type { GeoFile } from "@/geo/geo-file";
import { clipPolyline, pointInPolygon } from "@/geo/geometry";
import { createRng } from "@/sim/rng";
import { fromLocalMetres } from "@/world/projection";
import { VENUE_KINDS, type World } from "@/world/schema";

const VENUES_PER_CLUSTER = 4;

/**
 * A synthetic population over real geography, used until Qloo data exists (Plan 4). Synthetic only:
 * it carries no Qloo responses.
 * - Cells: a square grid over the bounds, skipping cells whose centre is in water.
 * - Density: street length per cell (a proxy for urban density).
 * - Scenes: each taste cluster has a home district, and a cell's archetype mix falls off with
 *   distance to those homes, so scenes have neighbourhoods.
 * - Venues: placed in cells weighted by density × that cluster's share there.
 */
export function makeSyntheticCity(
  file: GeoFile,
  opts: { seed?: number; clusters?: number; entitiesPerCluster?: number; cellSizeM?: number } = {},
): World {
  const { seed = 7, clusters = 6, entitiesPerCluster = 20, cellSizeM = 500 } = opts;
  const rng = createRng(seed);
  const { geo, city } = file;
  const b = geo.bounds;

  const centres: [number, number][] = [];
  for (let y = b.minY + cellSizeM / 2; y < b.maxY; y += cellSizeM) {
    for (let x = b.minX + cellSizeM / 2; x < b.maxX; x += cellSizeM) {
      if (!geo.water.some((ring) => pointInPolygon(x, y, ring))) centres.push([x, y]);
    }
  }

  const streetLength = centres.map(([cx, cy]) => {
    const rect = { minX: cx - cellSizeM / 2, maxX: cx + cellSizeM / 2, minY: cy - cellSizeM / 2, maxY: cy + cellSizeM / 2 };
    let len = 0;
    for (const road of geo.roads) {
      for (const piece of clipPolyline(road.points, rect)) {
        for (let i = 0; i + 1 < piece.length; i++) {
          len += Math.hypot(piece[i + 1][0] - piece[i][0], piece[i + 1][1] - piece[i][1]) * (road.kind === "major" ? 1.5 : 1);
        }
      }
    }
    return len;
  });
  const maxLen = Math.max(1, ...streetLength);

  const homes = Array.from({ length: clusters }, (): [number, number] => [
    b.minX + (0.15 + 0.7 * rng.next()) * (b.maxX - b.minX),
    b.minY + (0.15 + 0.7 * rng.next()) * (b.maxY - b.minY),
  ]);
  const falloff = (b.maxX - b.minX) / 4;

  const cells: World["cells"] = centres.map(([x, y], i) => {
    const raw = homes.map(([hx, hy]) => Math.exp(-Math.hypot(x - hx, y - hy) / falloff));
    const total = raw.reduce((a, v) => a + v, 0);
    const p = fromLocalMetres({ x, y }, city);
    return {
      geohash: `cell${i}`,
      lat: p.lat,
      lon: p.lon,
      density: 0.05 + streetLength[i] / maxLen,
      archetypes: raw.map((v, archetype) => ({ archetype, weight: v / total })),
    };
  });

  const idx = (c: number, j: number) => c * entitiesPerCluster + j;
  const pickCell = (cluster: number) => {
    const weights = cells.map((cell) => cell.density * cell.archetypes[cluster].weight);
    let r = rng.next() * weights.reduce((a, v) => a + v, 0);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  };

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
        ...(isVenue
          ? { cell: pickCell(c), capacity: 50, kind: VENUE_KINDS[(c * VENUES_PER_CLUSTER + j) % VENUE_KINDS.length] }
          : {}),
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

  const archetypes: World["archetypes"] = Array.from({ length: clusters }, (_, c) => ({
    id: `syn:arch:${c}`,
    name: `Synthetic scene ${c}`,
    genes: Array.from({ length: entitiesPerCluster - VENUES_PER_CLUSTER }, (_, k) => ({
      entity: idx(c, VENUES_PER_CLUSTER + k),
      weight: 0.6 + 0.4 * rng.next(),
    })),
  }));

  const heatmaps: World["heatmaps"] = Array.from({ length: clusters }, (_, c) => ({
    entity: idx(c, VENUES_PER_CLUSTER),
    values: cells.map((cell) => cell.archetypes[c].weight),
  }));

  return {
    version: 1,
    city: { name: city.name, lat: city.lat, lon: city.lon },
    entities,
    edges,
    cells,
    archetypes,
    heatmaps,
    geo,
  };
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm test`, `pnpm exec tsc --noEmit`, `pnpm lint`.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/world/fixtures/synthetic-city.ts src/world/fixtures/synthetic-city.test.ts
git commit -m "feat(world): generate a synthetic population over real city geometry"
```

---

### Task 4: Build-geo CLI and the London file

**Files:** create `scripts/build-geo.ts`, `public/geo/README.md`, `public/geo/london.json` (generated), `docs/decisions/0006-osm-geometry.md`; modify `package.json`.

- [ ] **Step 1: Write the CLI**

`scripts/build-geo.ts`:
```ts
import { mkdirSync, writeFileSync } from "node:fs";
import { CITIES, type CitySlug } from "@/geo/cities";
import { type GeoFile, GeoFileSchema } from "@/geo/geo-file";
import { buildOverpassQuery, parseOverpass } from "@/geo/overpass";

// Usage: pnpm build:geo <city-slug>   (e.g. london)
// One Overpass request per run; please don't loop this (Overpass fair-use policy).
const ENDPOINT = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "GenusLoci/0.1 (Qloo hackathon; https://github.com/jephoton/genusloci-culture-simulator)";

const slug = process.argv[2] as CitySlug | undefined;
if (!slug || !(slug in CITIES)) {
  console.error(`Usage: pnpm build:geo <${Object.keys(CITIES).join("|")}>`);
  process.exit(1);
}
const city = CITIES[slug];
const query = buildOverpassQuery(city, city.radiusM);
console.log(`Fetching ${city.name} (${city.radiusM} m radius) from Overpass…`);
const res = await fetch(ENDPOINT, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
  body: new URLSearchParams({ data: query }),
});
if (!res.ok) {
  console.error(`Overpass returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
  process.exit(1);
}
const geo = parseOverpass(await res.json(), city, city.radiusM);
const file: GeoFile = GeoFileSchema.parse({
  version: 1,
  city: { slug: city.slug, name: city.name, lat: city.lat, lon: city.lon },
  radiusM: city.radiusM,
  attribution: "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)",
  fetchedAt: new Date().toISOString(),
  geo,
});
mkdirSync("public/geo", { recursive: true });
const out = `public/geo/${city.slug}.json`;
const json = JSON.stringify(file);
writeFileSync(out, json);
console.log(
  `Wrote ${out}: ${geo.roads.length} roads, ${geo.water.length} water, ${geo.parks.length} parks, ${(json.length / 1024).toFixed(0)} KB`,
);
```

Add this to the `"scripts"` object in `package.json`:
```json
"build:geo": "tsx scripts/build-geo.ts"
```

- [ ] **Step 2: Write the data notice and the decision record**

`public/geo/README.md`:
```markdown
# City geometry

Files in this folder are derived from OpenStreetMap data and are licensed under the
[Open Database License (ODbL) 1.0](https://opendatacommons.org/licenses/odbl/1-0/).

© OpenStreetMap contributors — https://www.openstreetmap.org/copyright

They are generated by `pnpm build:geo <city>`, which simplifies and clips roads, water and parks,
then reprojects them to local metres. The application code in this repository is MIT-licensed; this
data is not.
```

`docs/decisions/0006-osm-geometry.md`:
```markdown
# 0006 — City geometry: prebuilt OpenStreetMap files in public/geo (ODbL)

- **Status:** Accepted (2026-10-10)
- **Decision:** A CLI (`pnpm build:geo <city>`) fetches roads, water and parks once per city from the Overpass API, then simplifies, clips and reprojects them, and writes `public/geo/<city>.json`. The app loads that file at runtime.
- **Licensing:**
  - The files are ODbL, with a notice in `public/geo/README.md`.
  - The app shows "© OpenStreetMap contributors".
  - The code remains MIT.
- **Alternatives considered:**
  - Fetching Overpass on demand at runtime: slow, fragile under judging load, and against Overpass fair use.
  - Map tiles: rejected in decision 0005.
- **Rationale:** real, recognisable streets now, without a Qloo key; deterministic demos; no runtime dependency.
- **Consequences:**
  - Each prebuilt city adds a static JSON file (aim for ≤ about 3 MB).
  - Plan 4's on-demand city builds will reuse `parseOverpass` server-side and cache the result rather than commit it.
```

- [ ] **Step 3: Generate London (needs network)**

Run: `pnpm build:geo london`
Expected: a line like `Wrote public/geo/london.json: N roads, M water, K parks, S KB`, with N in the thousands, M ≥ 1 (the Thames), and S ≤ about 3000.
- If Overpass returns 429 or 504, wait a minute and retry once by hand.
- If the file is over 3 MB, reduce the radius in `src/geo/cities.ts` (e.g. 2500) and regenerate.

- [ ] **Step 4: Validate the generated file**

Run:
```bash
node -e "const f=require('./public/geo/london.json');console.log(f.city.name,f.geo.roads.length,f.geo.water.length,f.geo.parks.length)"
```
Expected: `London` followed by non-zero counts.

- [ ] **Step 5: Commit**

```bash
git add scripts/build-geo.ts package.json docs/decisions/0006-osm-geometry.md public/geo/README.md
git commit -m "feat(geo): add build-geo CLI for OpenStreetMap city geometry"
git add public/geo/london.json
git commit -m "chore(geo): add London geometry from OpenStreetMap (ODbL)"
```

---

### Task 5: Load London in the game

**Files:** create `src/ui/useCityWorld.ts`, `src/ui/Attribution.tsx`; modify `src/ui/GameShell.tsx`.

- [ ] **Step 1: Create the loader hook**

`src/ui/useCityWorld.ts`:
```ts
"use client";

import { useEffect, useState } from "react";
import { GeoFileSchema } from "@/geo/geo-file";
import { demoWorld } from "@/ui/demo-world";
import { makeSyntheticCity } from "@/world/fixtures/synthetic-city";
import type { World } from "@/world/schema";

export type CityWorld = { world: World; attribution: string | null; fallback: boolean };

/** Loads real city geometry from public/geo and lays a synthetic population over it; falls back to Synthville. */
export function useCityWorld(slug: string): CityWorld | null {
  const [state, setState] = useState<CityWorld | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/geo/${slug}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const file = GeoFileSchema.parse(await res.json());
        if (!cancelled) setState({ world: makeSyntheticCity(file), attribution: file.attribution, fallback: false });
      } catch (e) {
        console.warn(`Couldn't load /geo/${slug}.json; using the synthetic city.`, e);
        if (!cancelled) setState({ world: demoWorld(), attribution: null, fallback: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return state;
}
```

- [ ] **Step 2: Create the attribution badge**

`src/ui/Attribution.tsx`:
```tsx
export function Attribution() {
  return (
    <p className="pointer-events-auto absolute bottom-1 right-2 text-[10px] text-zinc-500">
      Map data ©{" "}
      <a className="underline hover:text-zinc-300" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">
        OpenStreetMap contributors
      </a>
    </p>
  );
}
```

- [ ] **Step 3: Make GameShell load the city asynchronously.** In `src/ui/GameShell.tsx`:
- Remove the `demoWorld` import. Add these imports:
```ts
import type { World } from "@/world/schema";
import { Attribution } from "@/ui/Attribution";
import { useCityWorld } from "@/ui/useCityWorld";
```
- Rename the existing `export default function GameShell() {` to `function Game({ world, attribution }: { world: World; attribution: string | null }) {`.
- In `Game`, delete the line `const world = useMemo(() => demoWorld(), []);`. Keep `const layout = useMemo(() => buildLayout(world), [world]);`.
- Inside `Game`'s root `<div>`, right after `<TimelineBar … />`, add `{attribution && <Attribution />}`.
- Append the new default export:
```tsx
const CITY = "london";

export default function GameShell() {
  const city = useCityWorld(CITY);
  if (!city) {
    return <div className="grid h-dvh place-items-center bg-[#07080b] text-zinc-400">Mapping the streets…</div>;
  }
  return <Game world={city.world} attribution={city.attribution} />;
}
```

- [ ] **Step 4: Verify**

Run: `pnpm exec tsc --noEmit`, `pnpm lint`, `pnpm test`, `pnpm build`.
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add src/ui/useCityWorld.ts src/ui/Attribution.tsx src/ui/GameShell.tsx
git commit -m "feat(ui): load real London streets with OpenStreetMap attribution"
```

---

### Task 6: Browser check and docs (controller)

- [ ] Open `/` in the browser preview. Check that:
  - the Thames, real street pattern and parks are recognisable;
  - buildings fill the blocks and landmarks sit clear of roads (check `layout.fallbackPads`);
  - the simulation plays;
  - there are no console errors.

  Tune visuals if needed, each in its own `fix(render)` commit.
- [ ] Update `docs/architecture.md` (the `geo/` module, `pnpm build:geo`, the `public/geo` licence) and `docs/current-state.md`, and mark the 4a row in the roadmap. Commit: `docs: record Plan 4a completion`.
