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
    expect(g.boundingBox?.min.x).toBeCloseTo(0);
    expect(g.boundingBox?.max.x).toBeCloseTo(11);
    expect(g.boundingBox?.min.z).toBeCloseTo(-1);
    expect(g.boundingBox?.max.z).toBeCloseTo(10);
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
