import { geneSlot } from "@/sim/genome";
import type { SimState } from "@/sim/state";

/** 1-based ranks with ties averaged. */
export function ranks(values: ArrayLike<number>): Float64Array {
  const order = Array.from({ length: values.length }, (_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  const out = new Float64Array(values.length);
  for (let i = 0; i < order.length; ) {
    let j = i;
    while (j + 1 < order.length && values[order[j + 1]] === values[order[i]]) j++;
    const rank = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]] = rank;
    i = j + 1;
  }
  return out;
}

/** Spearman rank correlation; 0 when undefined (fewer than 2 points or no variance). */
export function spearman(a: ArrayLike<number>, b: ArrayLike<number>): number {
  const n = a.length;
  if (n < 2) return 0;
  const ra = ranks(a);
  const rb = ranks(b);
  const mean = (n + 1) / 2;
  let cov = 0;
  let va = 0;
  let vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (ra[i] - mean) * (rb[i] - mean);
    va += (ra[i] - mean) ** 2;
    vb += (rb[i] - mean) ** 2;
  }
  return va > 0 && vb > 0 ? cov / Math.sqrt(va * vb) : 0;
}

export type Fidelity = { perHeatmap: { entity: number; rho: number }[]; mean: number };

/**
 * Baseline fidelity: for each Qloo heatmap, the rank correlation across populated cells between the
 * simulated following (mean gene weight of the entity among residents) and the real heatmap affinity.
 */
export function computeFidelity(s: SimState): Fidelity {
  const nC = s.cw.nCells;
  const population = new Float64Array(nC);
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i]) population[s.homeCell[i]]++;
  const cells = Array.from({ length: nC }, (_, c) => c).filter((c) => population[c] > 0);

  const perHeatmap = s.cw.world.heatmaps.map((h) => {
    const following = new Float64Array(nC);
    for (let i = 0; i < s.alive.length; i++) {
      if (!s.alive[i]) continue;
      const slot = geneSlot(s.genomes, i, h.entity);
      if (slot >= 0) following[s.homeCell[i]] += s.genomes.w[slot];
    }
    const sim = cells.map((c) => following[c] / population[c]);
    const real = cells.map((c) => h.values[c]);
    return { entity: h.entity, rho: spearman(sim, real) };
  });
  const mean = perHeatmap.length > 0 ? perHeatmap.reduce((acc, x) => acc + x.rho, 0) / perHeatmap.length : 0;
  return { perHeatmap, mean };
}
