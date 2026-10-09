import { GENOME_CAP, type Genomes } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";

export type Clustering = {
  /** Unit-length dense centroids over entities. */
  centroids: Float32Array[];
  /** Per agent slot: centroid index, or -1. */
  assignment: Int32Array;
  sizes: number[];
};

function genomeNorm(g: Genomes, agent: number): number {
  let norm = 0;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = agent * GENOME_CAP + k;
    if (g.ids[slot] >= 0) norm += g.w[slot] * g.w[slot];
  }
  return Math.sqrt(norm);
}

/** Cosine similarity between an agent's sparse genome and a unit-length dense centroid. */
export function simToCentroid(g: Genomes, agent: number, centroid: Float32Array): number {
  const norm = genomeNorm(g, agent);
  if (norm === 0) return 0;
  let dot = 0;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = agent * GENOME_CAP + k;
    if (g.ids[slot] >= 0) dot += g.w[slot] * centroid[g.ids[slot]];
  }
  return dot / norm;
}

/** Adds the agent's unit-normalised genome into a dense vector. */
function addInto(out: Float32Array, g: Genomes, agent: number): void {
  const norm = genomeNorm(g, agent);
  if (norm === 0) return;
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = agent * GENOME_CAP + k;
    if (g.ids[slot] >= 0) out[g.ids[slot]] += g.w[slot] / norm;
  }
}

/** The agent's genome as a unit-length dense vector over entities. */
export function agentVector(g: Genomes, agent: number, nEntities: number): Float32Array {
  const v = new Float32Array(nEntities);
  addInto(v, g, agent);
  return v;
}

/** Scales v to unit length in place; returns false for a zero vector. */
function normalize(v: Float32Array): boolean {
  let norm = 0;
  for (const x of v) norm += x * x;
  if (norm === 0) return false;
  const inv = 1 / Math.sqrt(norm);
  for (let i = 0; i < v.length; i++) v[i] *= inv;
  return true;
}

function assign(s: SimState, centroids: Float32Array[]): Int32Array {
  const out = new Int32Array(s.alive.length).fill(-1);
  for (let i = 0; i < s.alive.length; i++) {
    if (!s.alive[i]) continue;
    let best = 0;
    for (let c = 0; c < centroids.length; c++) {
      const sim = simToCentroid(s.genomes, i, centroids[c]);
      if (sim > best) {
        best = sim;
        out[i] = c;
      }
    }
  }
  return out;
}

/**
 * Spherical k-means over agent genomes, warm-started from `seeds` (the previous scenes' centroids).
 * New scenes: sampled agents whose best similarity to every centroid is below newSceneThreshold
 * found a centroid of their own (up to maxScenes). Clusters smaller than minSceneSize are dropped
 * between iterations.
 */
export function clusterAgents(s: SimState, seeds: Float32Array[], rng: Rng): Clustering {
  const { config, genomes } = s;
  const nE = s.cw.nEntities;
  const n = s.alive.length;
  let centroids: Float32Array[] = seeds.map((c) => Float32Array.from(c));

  for (let t = 0; t < config.sceneSample && centroids.length < config.maxScenes; t++) {
    const i = rng.int(n);
    if (!s.alive[i] || genomeNorm(genomes, i) === 0) continue;
    let best = 0;
    for (const c of centroids) best = Math.max(best, simToCentroid(genomes, i, c));
    if (best < config.newSceneThreshold) centroids.push(agentVector(genomes, i, nE));
  }

  for (let iter = 0; iter < config.kmeansIters && centroids.length > 0; iter++) {
    const assignment = assign(s, centroids);
    const sums = centroids.map(() => new Float32Array(nE));
    const counts = new Int32Array(centroids.length);
    for (let i = 0; i < n; i++) {
      const c = assignment[i];
      if (c < 0) continue;
      counts[c]++;
      addInto(sums[c], genomes, i);
    }
    const kept: Float32Array[] = [];
    sums.forEach((v, c) => {
      if (counts[c] >= config.minSceneSize && normalize(v)) kept.push(v);
    });
    centroids = kept;
  }

  const assignment = assign(s, centroids);
  const sizes = centroids.map(() => 0);
  for (const c of assignment) if (c >= 0) sizes[c]++;
  return { centroids, assignment, sizes };
}
