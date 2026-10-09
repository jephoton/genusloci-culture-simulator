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
