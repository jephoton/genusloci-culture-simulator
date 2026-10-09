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
  }, 60_000); // ~1.6M expect() calls: needs more than the 5 s default

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
