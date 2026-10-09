import type { SimConfig } from "@/sim/config";
import type { Clustering } from "@/sim/scenes/cluster";
import type { SceneState } from "@/sim/scenes/types";

export const TOP_ENTITIES = 5;

/** Indices of the k largest positive entries, largest first (ties by index). */
export function topEntities(centroid: Float32Array, k: number): number[] {
  const best: number[] = [];
  for (let e = 0; e < centroid.length; e++) {
    if (centroid[e] <= 0) continue;
    if (best.length === k && centroid[e] <= centroid[best[k - 1]]) continue;
    if (best.length === k) best.pop();
    best.push(e);
    best.sort((a, b) => centroid[b] - centroid[a] || a - b);
  }
  return best;
}

/**
 * Matches a new clustering to the living scenes by member overlap.
 * - Each previous scene continues as the new cluster it contributes most to (if it supplies at least
 *   splitShare of it); its other such clusters are splits.
 * - Clusters with no strong predecessor are births.
 * - Scenes that don't continue are merges (if at least mergeShare of their members went to one
 *   cluster) or extinctions.
 */
export function updateLineages(
  sc: SceneState,
  cl: Clustering,
  tick: number,
  shares: Pick<SimConfig, "splitShare" | "mergeShare">,
): void {
  const nPrev = sc.live.length;
  const nNew = cl.centroids.length;
  const overlap = Array.from({ length: nPrev }, () => new Int32Array(nNew));
  const prevSize = new Int32Array(nPrev);
  for (let i = 0; i < cl.assignment.length; i++) {
    const p = sc.assignment[i];
    const c = cl.assignment[i];
    if (p >= 0) prevSize[p]++;
    if (p >= 0 && c >= 0) overlap[p][c]++;
  }

  const main = new Int32Array(nNew).fill(-1);
  for (let c = 0; c < nNew; c++) {
    let best = 0;
    for (let p = 0; p < nPrev; p++) {
      if (overlap[p][c] > best) {
        best = overlap[p][c];
        main[c] = p;
      }
    }
  }

  const born = (parent: number | null): number => {
    const id = sc.lineages.length;
    sc.lineages.push({ id, parent, bornTick: tick, diedTick: null, mergedInto: null, size: 0, peakSize: 0, topEntities: [] });
    return id;
  };

  const newIds = new Array<number>(nNew).fill(-1);
  const continued = new Uint8Array(nPrev);
  for (let p = 0; p < nPrev; p++) {
    const mine: number[] = [];
    for (let c = 0; c < nNew; c++) {
      if (main[c] === p && overlap[p][c] >= shares.splitShare * cl.sizes[c]) mine.push(c);
    }
    mine.sort((a, b) => overlap[p][b] - overlap[p][a] || a - b);
    mine.forEach((c, k) => {
      if (k === 0) {
        newIds[c] = sc.live[p];
        continued[p] = 1;
      } else {
        newIds[c] = born(sc.live[p]);
        sc.events.push({ tick, kind: "split", scene: newIds[c], other: sc.live[p] });
      }
    });
  }

  for (let c = 0; c < nNew; c++) {
    if (newIds[c] !== -1) continue;
    newIds[c] = born(null);
    sc.events.push({ tick, kind: "birth", scene: newIds[c], other: null });
  }

  for (let p = 0; p < nPrev; p++) {
    if (continued[p]) continue;
    const id = sc.live[p];
    const lineage = sc.lineages[id];
    lineage.diedTick = tick;
    let into = -1;
    let best = 0;
    for (let c = 0; c < nNew; c++) {
      if (overlap[p][c] > best) {
        best = overlap[p][c];
        into = c;
      }
    }
    if (into >= 0 && best >= shares.mergeShare * prevSize[p]) {
      lineage.mergedInto = newIds[into];
      sc.events.push({ tick, kind: "merge", scene: id, other: newIds[into] });
    } else {
      sc.events.push({ tick, kind: "extinction", scene: id, other: null });
    }
  }

  for (let c = 0; c < nNew; c++) {
    const lineage = sc.lineages[newIds[c]];
    lineage.size = cl.sizes[c];
    lineage.peakSize = Math.max(lineage.peakSize, cl.sizes[c]);
    lineage.topEntities = topEntities(cl.centroids[c], TOP_ENTITIES);
  }
  sc.live = newIds;
  sc.centroids = cl.centroids;
  sc.assignment = cl.assignment;
}
