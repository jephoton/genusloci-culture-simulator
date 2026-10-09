import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { GENOME_CAP } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { allocateAgentsToCells, cloneState, initState, pickWeighted } from "@/sim/state";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 100 };

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
  const F = config.friendsPerAgent;

  it("allocates agent slots with a reserve; only nAgents are alive", () => {
    expect(s.alive).toHaveLength(400);
    expect(Array.from(s.alive).filter((x) => x === 1)).toHaveLength(300);
    expect(Array.from(s.alive.subarray(0, 300)).every((x) => x === 1)).toBe(true);
    expect(Math.max(...s.homeCell.subarray(0, 300))).toBeLessThan(world.cells.length);
  });

  it("gives every alive agent a non-empty genome of world entities", () => {
    for (let i = 0; i < 300; i++) {
      const ids = Array.from(s.genomes.ids.subarray(i * GENOME_CAP, (i + 1) * GENOME_CAP)).filter((x) => x >= 0);
      expect(ids.length).toBeGreaterThan(0);
      expect(Math.max(...ids)).toBeLessThan(world.entities.length);
    }
  });

  it("leaves reserve slots empty", () => {
    expect(Array.from(s.genomes.ids.subarray(300 * GENOME_CAP)).every((x) => x === -1)).toBe(true);
    expect(Array.from(s.friends.subarray(300 * F)).every((x) => x === -1)).toBe(true);
  });

  it("gives friends that are other alive agents, with no duplicates", () => {
    for (let i = 0; i < 300; i++) {
      const fr = Array.from(s.friends.subarray(i * F, (i + 1) * F)).filter((x) => x >= 0);
      expect(fr).not.toContain(i);
      expect(new Set(fr).size).toBe(fr.length);
      fr.forEach((f) => expect(f).toBeLessThan(300));
    }
  });

  it("starts with all venues open, nobody out and no rent pressure", () => {
    expect(s.tick).toBe(0);
    expect(Array.from(s.venueOpen.subarray(0, s.nVenues)).every((x) => x === 1)).toBe(true);
    expect(Array.from(s.attendance).every((x) => x === -1)).toBe(true);
    expect(Array.from(s.cellRent).every((x) => x === 1)).toBe(true);
    expect(s.log).toEqual([]);
  });

  it("clones deeply: no typed array is shared except inside the compiled world", () => {
    const c = cloneState(s);
    const src = s as unknown as Record<string, unknown>;
    const dst = c as unknown as Record<string, unknown>;
    for (const key of Object.keys(src)) {
      if (ArrayBuffer.isView(src[key])) expect(dst[key], key).not.toBe(src[key]);
    }
    expect(c.genomes.ids).not.toBe(s.genomes.ids);
    expect(c.genomes.w).not.toBe(s.genomes.w);
    expect(c.scenes.assignment).not.toBe(s.scenes.assignment);
    expect(c.log).not.toBe(s.log);
    expect(c.cw).toBe(s.cw);
    c.venueOpen[0] = 0;
    expect(s.venueOpen[0]).toBe(1);
  });
});
