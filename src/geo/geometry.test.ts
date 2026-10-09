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
