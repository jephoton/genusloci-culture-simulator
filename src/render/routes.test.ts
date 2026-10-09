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
