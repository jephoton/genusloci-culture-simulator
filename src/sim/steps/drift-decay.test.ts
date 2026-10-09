import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { GENOME_CAP, addGene, geneSlot } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { applyDecay } from "@/sim/steps/decay";
import { applyDrift } from "@/sim/steps/drift";
import { edgeWeight } from "@/sim/world-index";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const genesOf = (s: ReturnType<typeof initState>, a: number) =>
  Array.from(s.genomes.ids.subarray(a * GENOME_CAP, (a + 1) * GENOME_CAP)).filter((x) => x >= 0);

describe("applyDrift", () => {
  it("adds a graph neighbour of an existing gene", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 1, driftRate: 1 }, 1);
    s.genomes.ids.fill(-1);
    s.genomes.w.fill(0);
    addGene(s.genomes, 0, 5, 1);
    s.curiosity[0] = 1;
    applyDrift(s, createRng(1));
    const added = genesOf(s, 0).filter((e) => e !== 5);
    expect(added).toHaveLength(1);
    expect(edgeWeight(s.cw, 5, added[0])).toBeGreaterThan(0);
  });

  it("does nothing when driftRate is 0", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 20, driftRate: 0 }, 1);
    const before = s.genomes.ids.slice();
    applyDrift(s, createRng(1));
    expect(s.genomes.ids).toEqual(before);
  });
});

describe("applyDecay", () => {
  it("weakens all genes and prunes tiny ones", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 1, decayRate: 0.5, minWeight: 0.1 }, 1);
    s.genomes.ids.fill(-1);
    s.genomes.w.fill(0);
    addGene(s.genomes, 0, 1, 0.8);
    addGene(s.genomes, 0, 2, 0.15);
    applyDecay(s);
    expect(s.genomes.w[geneSlot(s.genomes, 0, 1)]).toBeCloseTo(0.4);
    expect(geneSlot(s.genomes, 0, 2)).toBe(-1);
  });
});
