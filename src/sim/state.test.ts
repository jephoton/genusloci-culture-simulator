import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { GENOME_CAP } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { allocateAgentsToCells, cloneState, initState, pickWeighted } from "@/sim/state";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { ...DEFAULT_CONFIG, nAgents: 300 };

describe("allocateAgentsToCells", () => {
  it("distributes exactly n agents in proportion to density", () => {
    const cells = allocateAgentsToCells([1, 3, 0], 8);
    expect(cells).toHaveLength(8);
    const counts = [0, 0, 0];
    cells.forEach((c) => counts[c]++);
    expect(counts).toEqual([2, 6, 0]);
  });

  it("falls back to uniform when all densities are 0", () => {
    const counts = [0, 0];
    allocateAgentsToCells([0, 0], 4).forEach((c) => counts[c]++);
    expect(counts).toEqual([2, 2]);
  });
});

describe("pickWeighted", () => {
  it("never picks a zero weight and returns -1 when all are zero", () => {
    const rng = createRng(1);
    for (let i = 0; i < 200; i++) expect(pickWeighted([0, 1, 0], rng)).toBe(1);
    expect(pickWeighted([0, 0], rng)).toBe(-1);
  });
});

describe("initState", () => {
  const world = makeTinyWorld();
  const s = initState(world, config, 5);

  it("creates nAgents with valid home cells", () => {
    expect(s.homeCell).toHaveLength(300);
    expect(Math.max(...s.homeCell)).toBeLessThan(world.cells.length);
  });

  it("gives every agent a non-empty genome of world entities", () => {
    for (let i = 0; i < 300; i++) {
      const ids = Array.from(s.genomes.ids.subarray(i * GENOME_CAP, (i + 1) * GENOME_CAP)).filter((x) => x >= 0);
      expect(ids.length).toBeGreaterThan(0);
      expect(Math.max(...ids)).toBeLessThan(world.entities.length);
    }
  });

  it("gives friends that are other valid agents, with no duplicates", () => {
    const F = config.friendsPerAgent;
    for (let i = 0; i < 300; i++) {
      const fr = Array.from(s.friends.subarray(i * F, (i + 1) * F)).filter((x) => x >= 0);
      expect(fr).not.toContain(i);
      expect(new Set(fr).size).toBe(fr.length);
      fr.forEach((f) => expect(f).toBeLessThan(300));
    }
  });

  it("starts with all venues open and nobody out", () => {
    expect(s.tick).toBe(0);
    expect(Array.from(s.venueOpen).every((x) => x === 1)).toBe(true);
    expect(Array.from(s.attendance).every((x) => x === -1)).toBe(true);
  });

  it("clones deeply (mutating the clone leaves the original intact)", () => {
    const c = cloneState(s);
    c.genomes.w[0] = 0.123;
    c.venueOpen[0] = 0;
    expect(s.genomes.w[0]).not.toBe(0.123);
    expect(s.venueOpen[0]).toBe(1);
    expect(c.cw).toBe(s.cw);
  });
});
