import { describe, expect, it } from "vitest";
import {
  agentHomePosition, buildLayout, type CityLayout, distToSegment, hash01, LANDMARK_RADIUS, LANDMARK_SCALE, landmarkPosition,
  landmarkScale, MAX_LANDMARK_RADIUS, MIN_BUILDING_SIDE, MIN_LANDMARK_SCALE, nearestCell, PAD_GAP, PAD_MARGIN, PADS_PER_CELL,
  pointInPolygon, ROAD_HALF_WIDTH, type XZ,
} from "@/render/layout";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import type { Geo, World } from "@/world/schema";

const world = makeTinyWorld({ seed: 7, clusters: 6, entitiesPerCluster: 20, gridSize: 10 });
const layout = buildLayout(world);

/** London-like street grain (minor streets every 90 m) over the west half of a 4 × 4 city; the east half is open. */
const DENSE_STEP_M = 90;
function denseWorld(): { world: World; midX: number } {
  const base = makeTinyWorld({ seed: 3, gridSize: 4 });
  const b = (base.geo as Geo).bounds;
  const midX = (b.minX + b.maxX) / 2;
  const roads: Geo["roads"] = [];
  for (let x = b.minX; x <= midX; x += DENSE_STEP_M) roads.push({ kind: "minor", points: [[x, b.minY], [x, b.maxY]] });
  for (let y = b.minY; y <= b.maxY; y += DENSE_STEP_M) roads.push({ kind: "minor", points: [[b.minX, y], [midX, y]] });
  return { world: { ...base, geo: { bounds: b, roads, water: [], parks: [] } }, midX: midX / 10 };
}
const dense = denseWorld();
const denseLayout = buildLayout(dense.world);

const segmentsOf = (l: CityLayout) =>
  l.roads.flatMap((r) => r.points.slice(1).map((p, i) => ({ a: r.points[i], b: p, half: ROAD_HALF_WIDTH[r.kind] })));

/** Distance from a point to a polygon's boundary, negative inside. */
function signedDist(x: number, z: number, poly: XZ[]): number {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(x, z, poly[j], poly[i]));
  return pointInPolygon(x, z, poly) ? -d : d;
}

const padRadius = (l: CityLayout, p: number) => l.padScale[p] * MAX_LANDMARK_RADIUS;

/** Every way a building can touch a road ribbon, water, a park or a landmark pad at its drawn size. */
function buildingViolations(l: CityLayout): string[] {
  const b = l.buildings;
  const segments = segmentsOf(l);
  const areas = [...l.water, ...l.parks];
  // Collect violations instead of asserting per pair: millions of expect() calls are too slow.
  const out: string[] = [];
  for (let i = 0; i < b.count; i++) {
    const radius = Math.hypot(b.w[i], b.d[i]) / 2;
    for (const s of segments) if (distToSegment(b.x[i], b.z[i], s.a, s.b) < s.half + radius - 1e-4) out.push(`road ${i}`);
    for (const poly of areas) if (signedDist(b.x[i], b.z[i], poly) < radius - 1e-4) out.push(`area ${i}`);
    for (let p = 0; p < l.pads.length / 2; p++) {
      if (Math.hypot(l.pads[p * 2] - b.x[i], l.pads[p * 2 + 1] - b.z[i]) < radius + padRadius(l, p) + PAD_MARGIN - 1e-4) out.push(`pad ${i}`);
    }
    if (!(b.h[i] > 0)) out.push(`height ${i}`);
    if (Math.min(b.w[i], b.d[i]) < MIN_BUILDING_SIDE - 1e-4) out.push(`size ${i}`);
  }
  return out;
}

/** Every way a pad's largest landmark, drawn at the pad's scale, can touch a road, area or another pad. */
function padViolations(l: CityLayout): string[] {
  const segments = segmentsOf(l);
  const areas = [...l.water, ...l.parks];
  const out: string[] = [];
  const n = l.pads.length / 2;
  for (let i = 0; i < n; i++) {
    const x = l.pads[i * 2];
    const z = l.pads[i * 2 + 1];
    const r = padRadius(l, i);
    for (const s of segments) if (distToSegment(x, z, s.a, s.b) < s.half + r - 1e-4) out.push(`road ${i}`);
    for (const poly of areas) if (signedDist(x, z, poly) < r - 1e-4) out.push(`area ${i}`);
    for (let j = i + 1; j < n; j++) {
      if (Math.hypot(l.pads[j * 2] - x, l.pads[j * 2 + 1] - z) < padRadius(l, i) + padRadius(l, j) + PAD_GAP - 1e-4) out.push(`pads ${i}-${j}`);
    }
  }
  return out;
}

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
    expect(buildLayout(dense.world)).toEqual(denseLayout);
  });

  it("places cells and maps each back to itself", () => {
    expect(layout.cellX).toHaveLength(world.cells.length);
    expect(layout.spacing).toBeGreaterThan(10);
    for (let c = 0; c < world.cells.length; c++) expect(nearestCell(layout, layout.cellX[c], layout.cellZ[c])).toBe(c);
  });

  it("builds a city of buildings that avoid roads, water, parks and landmark pads", () => {
    expect(layout.buildings.count).toBeGreaterThan(500);
    expect(buildingViolations(layout)).toEqual([]);
  }, 30_000);

  it("builds more in denser cells", () => {
    const counts = new Array(world.cells.length).fill(0);
    for (let i = 0; i < layout.buildings.count; i++) counts[nearestCell(layout, layout.buildings.x[i], layout.buildings.z[i])]++;
    const order = world.cells.map((c, i) => ({ d: c.density, n: counts[i] })).sort((a, b) => a.d - b.d);
    const half = Math.floor(order.length / 2);
    const mean = (xs: { n: number }[]) => xs.reduce((a, x) => a + x.n, 0) / xs.length;
    expect(mean(order.slice(half))).toBeGreaterThan(mean(order.slice(0, half)));
  });

  it("sizes pads for the largest drawn landmark", () => {
    expect(MAX_LANDMARK_RADIUS).toBe(Math.max(...Object.values(LANDMARK_RADIUS)));
    expect(MIN_LANDMARK_SCALE).toBe(1);
  });

  it("gives open cities full-scale landmark pads clear of roads, water, parks and each other", () => {
    expect(layout.padScale).toHaveLength(layout.pads.length / 2);
    expect(layout.crampedPads).toBe(0);
    for (const s of layout.padScale) expect(s).toBe(Math.fround(LANDMARK_SCALE));
    expect(padViolations(layout)).toEqual([]);
  });

  it("gives each cell PADS_PER_CELL distinct landmark pads and deterministic agent homes", () => {
    expect(layout.pads).toHaveLength(world.cells.length * PADS_PER_CELL * 2);
    const [x0, z0] = landmarkPosition(layout, 3, 0);
    const [x1, z1] = landmarkPosition(layout, 3, 1);
    expect(Math.hypot(x1 - x0, z1 - z0)).toBeGreaterThan(1);
    expect(landmarkPosition(layout, 3, PADS_PER_CELL)).toEqual(landmarkPosition(layout, 3, 0));
    expect(landmarkScale(layout, 3, PADS_PER_CELL + 1)).toBe(layout.padScale[3 * PADS_PER_CELL + 1]);
    const home = agentHomePosition(layout, 5, 123);
    expect(agentHomePosition(layout, 5, 123)).toEqual(home);
    expect(Math.hypot(home[0] - layout.cellX[5], home[1] - layout.cellZ[5])).toBeLessThanOrEqual(layout.spacing * 0.4 + 1e-4);
  });
});

describe("buildLayout on a dense street grid", () => {
  const l = denseLayout;

  it("shrinks landmarks to fit between dense streets and keeps the full scale in the open", () => {
    expect(l.crampedPads).toBe(0);
    // Cells may borrow open ground just past their region, so classify pads by where they sit.
    const lastStreet = dense.midX - (dense.midX * 10 - (dense.world.geo as Geo).bounds.minX) % DENSE_STEP_M / 10;
    let nWest = 0;
    let nEast = 0;
    for (let p = 0; p < l.padScale.length; p++) {
      const x = l.pads[p * 2];
      expect(l.padScale[p]).toBeGreaterThanOrEqual(MIN_LANDMARK_SCALE);
      if (x < lastStreet) {
        nWest++;
        expect(l.padScale[p]).toBeLessThan(LANDMARK_SCALE * 0.75);
      } else if (x > lastStreet + LANDMARK_SCALE * MAX_LANDMARK_RADIUS + ROAD_HALF_WIDTH.minor) {
        nEast++;
        expect(l.padScale[p]).toBe(Math.fround(LANDMARK_SCALE));
      }
    }
    expect(nWest).toBeGreaterThan(0);
    expect(nEast).toBeGreaterThan(0);
    expect(padViolations(l)).toEqual([]);
  });

  it("puts each dense pad near the middle of a block", () => {
    const step = DENSE_STEP_M / 10;
    const b = l.bounds;
    for (let p = 0; p < l.padScale.length; p++) {
      const x = l.pads[p * 2];
      if (x > dense.midX - step) continue;
      // Distance from the block centre along x, in units of the street step (0 = centre, 0.5 = on a street).
      const fx = Math.abs((((x - b.minX) / step) % 1) - 0.5);
      expect(fx).toBeLessThan(0.15);
    }
  });

  it("fills dense blocks with small buildings of varied height that stay off the streets", () => {
    const b = l.buildings;
    const sides: number[] = [];
    const heights: number[] = [];
    for (let i = 0; i < b.count; i++) {
      if (b.x[i] >= dense.midX - 2) continue;
      sides.push(Math.max(b.w[i], b.d[i]));
      heights.push(b.h[i]);
    }
    expect(sides.length).toBeGreaterThan(400);
    // A 9-unit block minus 0.6-unit half-streets leaves a 7.8-unit square: footprints adapt to it.
    sides.sort((a, c) => a - c);
    expect(sides[Math.floor(sides.length / 2)]).toBeLessThan(3.5);
    expect(Math.max(...heights) / Math.min(...heights)).toBeGreaterThan(3);
    expect(buildingViolations(l)).toEqual([]);
  }, 30_000);
});
