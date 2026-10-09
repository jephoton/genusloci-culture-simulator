import { describe, expect, it } from "vitest";
import { parseWorld, type World } from "@/world/schema";

const minimal = (): World => ({
  version: 1,
  city: { name: "Testville", lat: 51.5, lon: -0.1 },
  entities: [
    { id: "syn:a", name: "A", type: "artist", tags: [], popularity: 0.5 },
    { id: "syn:v", name: "V", type: "place", tags: [], popularity: 0.5, cell: 0, capacity: 10 },
  ],
  edges: [{ source: 0, target: 1, weight: 0.5 }],
  cells: [{ geohash: "gcpv", lat: 51.5, lon: -0.1, density: 1, archetypes: [{ archetype: 0, weight: 1 }] }],
  archetypes: [{ id: "arch:0", name: "Zero", genes: [{ entity: 0, weight: 1 }] }],
  heatmaps: [{ entity: 0, values: [0.7] }],
});

describe("parseWorld", () => {
  it("accepts a valid world", () => {
    expect(parseWorld(minimal()).city.name).toBe("Testville");
  });

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

  it("rejects an edge pointing past the entity table", () => {
    const w = minimal();
    w.edges.push({ source: 0, target: 5, weight: 0.2 });
    expect(() => parseWorld(w)).toThrow();
  });

  it("rejects a venue cell out of range", () => {
    const w = minimal();
    w.entities[1].cell = 3;
    expect(() => parseWorld(w)).toThrow();
  });

  it("rejects a cell archetype out of range", () => {
    const w = minimal();
    w.cells[0].archetypes = [{ archetype: 2, weight: 1 }];
    expect(() => parseWorld(w)).toThrow();
  });

  it("rejects a heatmap whose length differs from the cell count", () => {
    const w = minimal();
    w.heatmaps[0].values = [0.1, 0.2];
    expect(() => parseWorld(w)).toThrow();
  });

  it("rejects an unknown version", () => {
    expect(() => parseWorld({ ...minimal(), version: 2 })).toThrow();
  });
});
