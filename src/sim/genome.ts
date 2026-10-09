import { type CompiledWorld, edgeWeight } from "@/sim/world-index";

/** Max genes per agent. Slots with id -1 are empty. */
export const GENOME_CAP = 32;

/** All agents' genomes in flat arrays: agent a owns slots [a*CAP, (a+1)*CAP). */
export type Genomes = { ids: Int32Array; w: Float32Array };

export function createGenomes(nAgents: number): Genomes {
  return {
    ids: new Int32Array(nAgents * GENOME_CAP).fill(-1),
    w: new Float32Array(nAgents * GENOME_CAP),
  };
}

export function cloneGenomes(g: Genomes): Genomes {
  return { ids: g.ids.slice(), w: g.w.slice() };
}

/** Slot index holding `entity` for `agent`, or -1. */
export function geneSlot(g: Genomes, agent: number, entity: number): number {
  const base = agent * GENOME_CAP;
  for (let k = 0; k < GENOME_CAP; k++) if (g.ids[base + k] === entity) return base + k;
  return -1;
}

/** Reinforce an existing gene, fill an empty slot, or replace the weakest gene if `weight` beats it. */
export function addGene(g: Genomes, agent: number, entity: number, weight: number): void {
  const base = agent * GENOME_CAP;
  let empty = -1;
  let weakest = -1;
  let weakestW = Infinity;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = base + k;
    const id = g.ids[slot];
    if (id === entity) {
      g.w[slot] = Math.min(1, g.w[slot] + weight);
      return;
    }
    if (id === -1) {
      if (empty === -1) empty = slot;
    } else if (g.w[slot] < weakestW) {
      weakestW = g.w[slot];
      weakest = slot;
    }
  }
  const target = empty !== -1 ? empty : weight > weakestW ? weakest : -1;
  if (target === -1) return;
  g.ids[target] = entity;
  g.w[target] = Math.min(1, weight);
}

export function decayGenome(g: Genomes, agent: number, rate: number, minWeight: number): void {
  const base = agent * GENOME_CAP;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = base + k;
    if (g.ids[slot] === -1) continue;
    g.w[slot] *= 1 - rate;
    if (g.w[slot] < minWeight) {
      g.ids[slot] = -1;
      g.w[slot] = 0;
    }
  }
}

/** Weighted mean link strength from the genome to `entity`, in [0, 1]. */
export function affinityToEntity(g: Genomes, agent: number, cw: CompiledWorld, entity: number): number {
  const base = agent * GENOME_CAP;
  let num = 0;
  let den = 0;
  for (let k = 0; k < GENOME_CAP; k++) {
    const id = g.ids[base + k];
    if (id === -1) continue;
    const w = g.w[base + k];
    den += w;
    num += w * (id === entity ? 1 : edgeWeight(cw, id, entity));
  }
  return den > 0 ? num / den : 0;
}

/** Weighted mean of the venue's profile over the genome, in [0, 1]. */
export function venueAffinity(g: Genomes, agent: number, cw: CompiledWorld, venue: number): number {
  const base = agent * GENOME_CAP;
  const row = venue * cw.nEntities;
  let num = 0;
  let den = 0;
  for (let k = 0; k < GENOME_CAP; k++) {
    const id = g.ids[base + k];
    if (id === -1) continue;
    const w = g.w[base + k];
    den += w;
    num += w * cw.venueProfile[row + id];
  }
  return den > 0 ? num / den : 0;
}

/** Cosine similarity of two agents' sparse genomes. */
export function genomeSimilarity(g: Genomes, a: number, b: number): number {
  const ba = a * GENOME_CAP;
  const bb = b * GENOME_CAP;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < GENOME_CAP; i++) {
    const wa = g.w[ba + i];
    const wb = g.w[bb + i];
    if (g.ids[ba + i] !== -1) na += wa * wa;
    if (g.ids[bb + i] !== -1) nb += wb * wb;
    const id = g.ids[ba + i];
    if (id === -1) continue;
    for (let j = 0; j < GENOME_CAP; j++) {
      if (g.ids[bb + j] === id) {
        dot += wa * g.w[bb + j];
        break;
      }
    }
  }
  return na > 0 && nb > 0 ? dot / Math.sqrt(na * nb) : 0;
}

/** Entity with the highest weight, or -1 for an empty genome. */
export function topGene(g: Genomes, agent: number): number {
  const base = agent * GENOME_CAP;
  let best = -1;
  let bestW = -1;
  for (let k = 0; k < GENOME_CAP; k++) {
    if (g.ids[base + k] !== -1 && g.w[base + k] > bestW) {
      bestW = g.w[base + k];
      best = g.ids[base + k];
    }
  }
  return best;
}
