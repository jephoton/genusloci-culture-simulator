import { describe, expect, it } from "vitest";
import { compileWorld, distKm, edgeWeight } from "@/sim/world-index";
import type { World } from "@/world/schema";

const world = (): World => ({
  version: 1,
  city: { name: "T", lat: 0, lon: 0 },
  entities: [
    { id: "syn:a", name: "A", type: "artist", tags: [], popularity: 0.5 },
    { id: "syn:b", name: "B", type: "artist", tags: [], popularity: 0.5 },
    { id: "syn:v", name: "V", type: "place", tags: [], popularity: 0.5, cell: 1, capacity: 20 },
  ],
  edges: [
    { source: 0, target: 2, weight: 0.5 },
    { source: 0, target: 1, weight: 0.3 },
    { source: 0, target: 1, weight: 0.7 },
    { source: 2, target: 0, weight: 0.4 },
    { source: 1, target: 1, weight: 0.9 },
  ],
  cells: [
    { geohash: "a", lat: 0, lon: 0, density: 1, archetypes: [{ archetype: 0, weight: 1 }] },
    { geohash: "b", lat: 0, lon: 0.1, density: 1, archetypes: [{ archetype: 0, weight: 1 }] },
  ],
  archetypes: [{ id: "x", name: "X", genes: [{ entity: 0, weight: 1 }] }],
  heatmaps: [],
});

describe("compileWorld", () => {
  const cw = compileWorld(world());

  it("builds CSR edges, keeping the max weight of duplicates and dropping self-loops", () => {
    expect(edgeWeight(cw, 0, 1)).toBeCloseTo(0.7);
    expect(edgeWeight(cw, 0, 2)).toBeCloseTo(0.5);
    expect(edgeWeight(cw, 1, 0)).toBe(0);
    expect(edgeWeight(cw, 1, 1)).toBe(0);
  });

  it("drops zero-weight edges so drift only follows real affinity", () => {
    const w = world();
    w.edges.push({ source: 1, target: 2, weight: 0 });
    const c = compileWorld(w);
    expect(c.edgeOffsets[2] - c.edgeOffsets[1]).toBe(0);
  });

  it("indexes venues with cell and capacity", () => {
    expect(Array.from(cw.venues)).toEqual([2]);
    expect(cw.venueCell[0]).toBe(1);
    expect(cw.venueCapacity[0]).toBe(20);
  });

  it("builds the venue profile: 1 for itself, edge weight for neighbours", () => {
    expect(cw.venueProfile[0 * cw.nEntities + 2]).toBe(1);
    expect(cw.venueProfile[0 * cw.nEntities + 0]).toBeCloseTo(0.4);
    expect(cw.venueProfile[0 * cw.nEntities + 1]).toBe(0);
  });

  it("lists nearby venues per cell", () => {
    expect(Array.from(cw.nearbyVenues[0])).toEqual([0]);
    expect(Array.from(cw.nearbyVenues[1])).toEqual([0]);
  });

  it("computes distance in km", () => {
    expect(distKm(cw, 0, 0)).toBe(0);
    expect(distKm(cw, 0, 1)).toBeCloseTo(11.1, 0);
  });
});
