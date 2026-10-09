import { describe, expect, it } from "vitest";
import { compileWorld, distKm, edgeWeight, writeVenueProfile } from "@/sim/world-index";
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

  it("lists place entities and counts cells", () => {
    expect(Array.from(cw.places)).toEqual([2]);
    expect(cw.nCells).toBe(2);
  });

  it("computes distance in km", () => {
    expect(distKm(cw, 0, 0)).toBe(0);
    expect(distKm(cw, 0, 1)).toBeCloseTo(11.1, 0);
  });
});

describe("writeVenueProfile", () => {
  it("writes 1 for the venue itself and edge weights for neighbours, only in its row", () => {
    const cw = compileWorld(world());
    const out = new Float32Array(cw.nEntities * 2).fill(9);
    writeVenueProfile(cw, 2, out, cw.nEntities);
    expect(Array.from(out.subarray(0, 3))).toEqual([9, 9, 9]);
    expect(out[3 + 2]).toBe(1);
    expect(out[3 + 0]).toBeCloseTo(0.4);
    expect(out[3 + 1]).toBe(0);
  });
});
