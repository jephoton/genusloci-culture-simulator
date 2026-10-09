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
 * (1) the venue itself and (2) a random co-attendee's strongest gene.
 */
export function applyExposure(s: SimState, rng: Rng, roster: Roster): void {
  const { cw, config, genomes } = s;
  for (let i = 0; i < s.attendance.length; i++) {
    const v = s.attendance[i];
    if (v < 0) continue;

    const base = i * GENOME_CAP;
    const row = v * cw.nEntities;
    for (let k = 0; k < GENOME_CAP; k++) {
      const id = genomes.ids[base + k];
      if (id < 0) continue;
      const p = cw.venueProfile[row + id];
      if (p > 0) genomes.w[base + k] = Math.min(1, genomes.w[base + k] + config.reinforce * p);
    }

    tryAdopt(s, i, cw.venues[v], rng);

    const size = roster.offsets[v + 1] - roster.offsets[v];
    if (size > 1) {
      const other = roster.members[roster.offsets[v] + rng.int(size)];
      if (other !== i) {
        const e = topGene(genomes, other);
        if (e >= 0) tryAdopt(s, i, e, rng);
      }
    }
  }
}
