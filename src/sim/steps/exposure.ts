import { GENOME_CAP, addGene, affinityToEntity, geneSlot, topGene } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";
import type { Roster } from "@/sim/steps/attendance";

/** P(agent adopts entity) = adoptBase × (taste-graph affinity + socialWeight × share of friends holding it). */
export function adoptionProbability(s: SimState, agent: number, entity: number): number {
  const { config, cw, genomes } = s;
  const F = config.friendsPerAgent;
  let have = 0;
  let total = 0;
  for (let f = 0; f < F; f++) {
    const friend = s.friends[agent * F + f];
    if (friend < 0) continue;
    total++;
    if (geneSlot(genomes, friend, entity) >= 0) have++;
  }
  const social = total > 0 ? have / total : 0;
  const affinity = affinityToEntity(genomes, agent, cw, entity);
  return Math.min(1, config.adoptBase * (affinity + config.socialWeight * social));
}

function tryAdopt(s: SimState, agent: number, entity: number, rng: Rng): void {
  if (geneSlot(s.genomes, agent, entity) >= 0) return;
  if (rng.next() < adoptionProbability(s, agent, entity)) {
    addGene(s.genomes, agent, entity, s.config.initialAdoptWeight);
  }
}

/**
 * For each attendee: reinforce genes the venue's profile shares, then try to adopt
 * (1) the venue's entity and (2) a random co-attendee's strongest gene.
 */
export function applyExposure(s: SimState, rng: Rng, roster: Roster): void {
  const { config, genomes } = s;
  const nE = s.cw.nEntities;
  // Snapshot every attendee's strongest gene first, so adoption this tick doesn't depend on agent order.
  const tops = new Int32Array(s.attendance.length).fill(-1);
  for (let i = 0; i < s.attendance.length; i++) if (s.attendance[i] >= 0) tops[i] = topGene(genomes, i);
  for (let i = 0; i < s.attendance.length; i++) {
    const v = s.attendance[i];
    if (v < 0) continue;

    const base = i * GENOME_CAP;
    const row = v * nE;
    for (let k = 0; k < GENOME_CAP; k++) {
      const id = genomes.ids[base + k];
      if (id < 0) continue;
      const p = s.venueProfile[row + id];
      if (p > 0) genomes.w[base + k] = Math.min(1, genomes.w[base + k] + config.reinforce * p);
    }

    tryAdopt(s, i, s.venueEntity[v], rng);

    const size = roster.offsets[v + 1] - roster.offsets[v];
    if (size > 1) {
      const other = roster.members[roster.offsets[v] + rng.int(size)];
      if (other !== i) {
        const e = tops[other];
        if (e >= 0) tryAdopt(s, i, e, rng);
      }
    }
  }
}
