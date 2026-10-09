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
