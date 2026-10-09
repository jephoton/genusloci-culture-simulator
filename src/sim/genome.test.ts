import { describe, expect, it } from "vitest";
import {
  GENOME_CAP, addGene, affinityToEntity, createGenomes, decayGenome,
  geneSlot, genomeSimilarity, topGene, venueAffinity,
} from "@/sim/genome";
import { compileWorld, writeVenueProfile } from "@/sim/world-index";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const cw = compileWorld(makeTinyWorld());
const PER = 12;
const idx = (c: number, j: number) => c * PER + j;

describe("genome", () => {
  it("adds, reinforces and caps weights at 1", () => {
    const g = createGenomes(1);
    addGene(g, 0, 5, 0.4);
    addGene(g, 0, 5, 0.9);
    expect(g.w[geneSlot(g, 0, 5)]).toBe(1);
  });

  it("replaces the weakest gene when full, only if the newcomer is stronger", () => {
    const g = createGenomes(1);
    for (let k = 0; k < GENOME_CAP; k++) addGene(g, 0, 100 + k, 0.5);
    addGene(g, 0, 100, 0.0); // no-op reinforce
    g.w[geneSlot(g, 0, 107)] = 0.1;
    addGene(g, 0, 999, 0.05);
    expect(geneSlot(g, 0, 999)).toBe(-1);
    addGene(g, 0, 999, 0.3);
    expect(geneSlot(g, 0, 999)).toBeGreaterThanOrEqual(0);
    expect(geneSlot(g, 0, 107)).toBe(-1);
  });

  it("decays and prunes", () => {
    const g = createGenomes(1);
    addGene(g, 0, 1, 0.5);
    addGene(g, 0, 2, 0.021);
    decayGenome(g, 0, 0.1, 0.02);
    expect(g.w[geneSlot(g, 0, 1)]).toBeCloseTo(0.45);
    expect(geneSlot(g, 0, 2)).toBe(-1);
  });

  it("scores affinity higher for linked entities", () => {
    const g = createGenomes(1);
    addGene(g, 0, idx(0, 4), 1);
    const same = affinityToEntity(g, 0, cw, idx(0, 5));
    const other = affinityToEntity(g, 0, cw, idx(1, 5));
    expect(same).toBeGreaterThan(0.4);
    expect(same).toBeGreaterThan(other);
    expect(affinityToEntity(g, 0, cw, idx(0, 4))).toBe(1);
  });

  it("returns 0 affinity for an empty genome", () => {
    expect(affinityToEntity(createGenomes(1), 0, cw, 0)).toBe(0);
  });

  it("scores venue affinity higher for same-cluster venues", () => {
    const g = createGenomes(1);
    addGene(g, 0, idx(0, 5), 1);
    addGene(g, 0, idx(0, 6), 1);
    const profile = new Float32Array(cw.nEntities * 2);
    writeVenueProfile(cw, idx(0, 0), profile, 0);
    writeVenueProfile(cw, idx(1, 0), profile, cw.nEntities);
    expect(venueAffinity(g, 0, profile, 0)).toBeGreaterThan(venueAffinity(g, 0, profile, cw.nEntities));
  });

  it("computes cosine similarity and the top gene", () => {
    const g = createGenomes(3);
    addGene(g, 0, 1, 1); addGene(g, 0, 2, 0.5);
    addGene(g, 1, 1, 1); addGene(g, 1, 2, 0.5);
    addGene(g, 2, 9, 1);
    expect(genomeSimilarity(g, 0, 1)).toBeCloseTo(1);
    expect(genomeSimilarity(g, 0, 2)).toBe(0);
    expect(topGene(g, 0)).toBe(1);
    expect(topGene(createGenomes(1), 0)).toBe(-1);
  });
});
