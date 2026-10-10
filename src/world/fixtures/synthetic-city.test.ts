import { describe, expect, it } from "vitest";
import type { GeoFile } from "@/geo/geo-file";
import { pointInPolygon } from "@/geo/geometry";
import { createRng } from "@/sim/rng";
import { clusterHomes, makeSyntheticCity, neighbourhoodMix } from "@/world/fixtures/synthetic-city";
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

  it("gives the cells near each cluster's home that cluster as the dominant scene", () => {
    const homes = clusterHomes(file.geo.bounds, 6, createRng(7));
    const local = world.cells.map((c) => toLocalMetres(c, file.city));
    const dist = (p: { x: number; y: number }, [hx, hy]: [number, number]) => Math.hypot(p.x - hx, p.y - hy);
    let checked = 0;
    homes.forEach((home, c) => {
      const nearest = local.reduce((best, p, i) => (dist(p, home) < dist(local[best], home) ? i : best), 0);
      // Skip a home whose nearest cell sits closer to another home (two homes in one district).
      if (homes.some((other, k) => k !== c && dist(local[nearest], other) < dist(local[nearest], home))) return;
      const mix = world.cells[nearest].archetypes;
      const top = mix.reduce((a, b) => (b.weight > a.weight ? b : a));
      expect(top.archetype).toBe(c);
      expect(top.weight).toBeGreaterThan(0.4);
      checked++;
    });
    expect(checked).toBeGreaterThanOrEqual(3);
  });

  it("makes most neighbourhoods distinctive: one or two scenes dominate each cell", () => {
    const topTwo = world.cells.map((c) => {
      const w = c.archetypes.map((a) => a.weight).sort((a, b) => b - a);
      return w[0] + w[1];
    });
    expect(topTwo.filter((t) => t >= 0.6).length / topTwo.length).toBeGreaterThanOrEqual(0.8);
  });
});

describe("neighbourhoodMix", () => {
  const homes: [number, number][] = [[0, 0], [1000, 0], [0, 1000]];

  it("is a distribution dominated by the nearest home", () => {
    const mix = neighbourhoodMix(50, 0, homes, 300, 0.15);
    expect(mix.reduce((a, v) => a + v, 0)).toBeCloseTo(1);
    expect(mix[0]).toBeGreaterThan(0.7);
  });

  it("keeps at least a 10% minority share everywhere", () => {
    for (const [x, y] of [[0, 0], [1000, 0], [500, 500], [-2000, -2000]]) {
      const mix = neighbourhoodMix(x, y, homes, 300, 0.15);
      expect(1 - Math.max(...mix)).toBeGreaterThanOrEqual(0.1);
    }
  });

  it("splits a cell between two equally near homes", () => {
    const mix = neighbourhoodMix(500, 0, homes, 300, 0.15);
    expect(mix[0]).toBeCloseTo(mix[1]);
    expect(mix[0]).toBeGreaterThan(mix[2]);
  });
});
