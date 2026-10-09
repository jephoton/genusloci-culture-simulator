import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { GENOME_CAP, addGene, geneSlot } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { tallyAttendance } from "@/sim/steps/attendance";
import { adoptionProbability, applyExposure } from "@/sim/steps/exposure";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const idx = (c: number, j: number) => c * 12 + j;
const clearAgent = (s: ReturnType<typeof initState>, a: number) => {
  s.genomes.ids.fill(-1, a * GENOME_CAP, (a + 1) * GENOME_CAP);
  s.genomes.w.fill(0, a * GENOME_CAP, (a + 1) * GENOME_CAP);
  s.friends.fill(-1, a * s.config.friendsPerAgent, (a + 1) * s.config.friendsPerAgent);
};

describe("tallyAttendance", () => {
  it("counts visitors and groups them by venue", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 6, agentReserve: 0 }, 1);
    s.attendance = Int32Array.from([0, 2, 0, -1, 2, 2]);
    const roster = tallyAttendance(s);
    expect(s.venueAttendance[0]).toBe(2);
    expect(s.venueAttendance[2]).toBe(3);
    const at = (v: number) => Array.from(roster.members.subarray(roster.offsets[v], roster.offsets[v + 1]));
    expect(at(0)).toEqual([0, 2]);
    expect(at(2)).toEqual([1, 4, 5]);
  });
});

describe("adoptionProbability", () => {
  it("is higher for entities linked to the genome", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 50, agentReserve: 0 }, 1);
    clearAgent(s, 0);
    addGene(s.genomes, 0, idx(0, 4), 1);
    const same = adoptionProbability(s, 0, idx(0, 5));
    const other = adoptionProbability(s, 0, idx(1, 5));
    expect(same).toBeGreaterThan(0);
    expect(same).toBeGreaterThan(other);
  });

  it("rises when friends hold the entity", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 50, agentReserve: 0 }, 1);
    clearAgent(s, 0);
    addGene(s.genomes, 0, idx(0, 4), 1);
    const before = adoptionProbability(s, 0, idx(1, 5));
    s.friends[0] = 1;
    addGene(s.genomes, 1, idx(1, 5), 1);
    expect(adoptionProbability(s, 0, idx(1, 5))).toBeGreaterThan(before);
  });
});

describe("applyExposure", () => {
  it("reinforces genes shared with the attended venue", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 2, agentReserve: 0 }, 1);
    clearAgent(s, 0);
    clearAgent(s, 1);
    const venue = Array.from(s.venueEntity.subarray(0, s.nVenues)).indexOf(idx(0, 0));
    addGene(s.genomes, 0, idx(0, 5), 0.5);
    s.attendance = Int32Array.from([venue, -1]);
    applyExposure(s, createRng(1), tallyAttendance(s));
    expect(s.genomes.w[geneSlot(s.genomes, 0, idx(0, 5))]).toBeGreaterThan(0.5);
  });

  it("lets attendees adopt the venue itself over repeated visits", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 2, agentReserve: 0, adoptBase: 1 }, 1);
    clearAgent(s, 0);
    clearAgent(s, 1);
    const venue = Array.from(s.venueEntity.subarray(0, s.nVenues)).indexOf(idx(0, 0));
    addGene(s.genomes, 0, idx(0, 5), 1);
    const rng = createRng(4);
    for (let t = 0; t < 20; t++) {
      s.attendance = Int32Array.from([venue, -1]);
      applyExposure(s, rng, tallyAttendance(s));
    }
    expect(geneSlot(s.genomes, 0, idx(0, 0))).toBeGreaterThanOrEqual(0);
  });
});
