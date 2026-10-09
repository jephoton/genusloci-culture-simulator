import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { addGene, createGenomes, GENOME_CAP } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { agentVector, clusterAgents, simToCentroid } from "@/sim/scenes/cluster";
import { initState } from "@/sim/state";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const config = { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 50, minSceneSize: 20 };
const clusterOf = (e: number) => Math.floor(e / 12);

describe("simToCentroid / agentVector", () => {
  it("is 1 for the agent's own vector and 0 for a disjoint one", () => {
    const g = createGenomes(2);
    addGene(g, 0, 1, 0.5);
    addGene(g, 0, 2, 1);
    addGene(g, 1, 3, 1);
    expect(simToCentroid(g, 0, agentVector(g, 0, 5))).toBeCloseTo(1);
    expect(simToCentroid(g, 0, agentVector(g, 1, 5))).toBe(0);
  });
});

describe("clusterAgents", () => {
  const s = initState(world, config, 3);
  const result = clusterAgents(s, [], createRng(1));

  it("finds the three synthetic taste clusters with high purity", () => {
    expect(result.centroids.length).toBeGreaterThanOrEqual(3);
    const majority = result.centroids.map((_, c) => {
      const counts = [0, 0, 0];
      for (let i = 0; i < 600; i++) if (result.assignment[i] === c) counts[clusterOf(s.genomes.ids[i * GENOME_CAP])]++;
      const total = counts.reduce((a, b) => a + b, 0);
      return { cluster: counts.indexOf(Math.max(...counts)), purity: Math.max(...counts) / total };
    });
    expect(new Set(majority.map((m) => m.cluster)).size).toBe(3);
    majority.forEach((m) => expect(m.purity).toBeGreaterThan(0.9));
  });

  it("assigns every alive agent with genes, and no reserve slot", () => {
    for (let i = 0; i < 600; i++) expect(result.assignment[i]).toBeGreaterThanOrEqual(0);
    for (let i = 600; i < 650; i++) expect(result.assignment[i]).toBe(-1);
    expect(result.sizes.reduce((a, b) => a + b, 0)).toBe(600);
  });

  it("returns unit-length centroids", () => {
    for (const c of result.centroids) {
      let norm = 0;
      for (const x of c) norm += x * x;
      expect(norm).toBeCloseTo(1, 4);
    }
  });

  it("is deterministic and stable when warm-started from its own centroids", () => {
    const again = clusterAgents(s, [], createRng(1));
    expect(Array.from(again.assignment)).toEqual(Array.from(result.assignment));
    const warm = clusterAgents(s, result.centroids, createRng(2));
    let same = 0;
    for (let i = 0; i < 600; i++) if (warm.assignment[i] === result.assignment[i]) same++;
    expect(same / 600).toBeGreaterThan(0.95);
  });
});
