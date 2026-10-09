import { GENOME_CAP, addGene } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";

/**
 * Mutation: with P = driftRate × curiosity, pick a gene (weighted by strength), then a neighbour
 * of it on the taste graph (weighted by edge affinity), and add it at half the adoption weight.
 * Drift only ever follows real affinity edges.
 */
export function applyDrift(s: SimState, rng: Rng): void {
  const { cw, config, genomes } = s;
  for (let i = 0; i < s.homeCell.length; i++) {
    if (rng.next() >= config.driftRate * s.curiosity[i]) continue;
    const base = i * GENOME_CAP;

    let total = 0;
    for (let k = 0; k < GENOME_CAP; k++) if (genomes.ids[base + k] >= 0) total += genomes.w[base + k];
    if (total <= 0) continue;
    let r = rng.next() * total;
    let source = -1;
    for (let k = 0; k < GENOME_CAP; k++) {
      if (genomes.ids[base + k] < 0) continue;
      source = genomes.ids[base + k];
      r -= genomes.w[base + k];
      if (r < 0) break;
    }

    const start = cw.edgeOffsets[source];
    const end = cw.edgeOffsets[source + 1];
    if (end === start) continue;
    let edgeTotal = 0;
    for (let j = start; j < end; j++) edgeTotal += cw.edgeWeights[j];
    let re = rng.next() * edgeTotal;
    let target = cw.edgeTargets[end - 1];
    for (let j = start; j < end; j++) {
      re -= cw.edgeWeights[j];
      if (re < 0) {
        target = cw.edgeTargets[j];
        break;
      }
    }
    addGene(genomes, i, target, config.initialAdoptWeight * 0.5);
  }
}
