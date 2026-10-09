import type { SimState } from "@/sim/state";
import { addVenue, buildNearbyVenues, hasVenueRoom } from "@/sim/venue-table";
import { DEFAULT_VENUE_CAPACITY, writeVenueProfile } from "@/sim/world-index";

/** An underserved scene, where it lives, and the real place that best matches its taste. */
export type Niche = { scene: number; score: number; cell: number; entity: number };

function cosine(profile: Float32Array, offset: number, nE: number, centroid: Float32Array): number {
  let dot = 0;
  let norm = 0;
  for (let e = 0; e < nE; e++) {
    const p = profile[offset + e];
    if (p === 0) continue;
    dot += p * centroid[e];
    norm += p * p;
  }
  return norm > 0 ? dot / Math.sqrt(norm) : 0;
}

/**
 * Living scenes ranked by unmet demand: score = scene size ÷ (1 + Σ open permanent venues'
 * rent-adjusted capacity × taste match). Each niche names the cell where most members live and the
 * place entity whose profile best matches the scene.
 */
export function findNiches(s: SimState, limit: number): Niche[] {
  const sc = s.scenes;
  const nE = s.cw.nEntities;
  if (sc.live.length === 0) return [];

  const sizes = new Int32Array(sc.live.length);
  const cellCounts = sc.live.map(() => new Map<number, number>());
  for (let i = 0; i < sc.assignment.length; i++) {
    const a = sc.assignment[i];
    if (a < 0 || !s.alive[i]) continue;
    sizes[a]++;
    const counts = cellCounts[a];
    counts.set(s.homeCell[i], (counts.get(s.homeCell[i]) ?? 0) + 1);
  }

  const ranked = sc.live
    .map((id, a) => {
      let served = 0;
      for (let v = 0; v < s.nVenues; v++) {
        if (!s.venueOpen[v] || s.venueExpires[v] >= 0) continue;
        const match = cosine(s.venueProfile, v * nE, nE, sc.centroids[a]);
        if (match > 0) served += (match * s.venueCapacity[v]) / s.cellRent[s.venueCell[v]];
      }
      return { a, id, score: sizes[a] / (1 + served) };
    })
    .sort((x, y) => y.score - x.score || x.a - y.a)
    .slice(0, limit);

  const row = new Float32Array(nE);
  return ranked.map(({ a, id, score }) => {
    let cell = 0;
    let most = -1;
    for (const [c, k] of cellCounts[a]) {
      if (k > most || (k === most && c < cell)) {
        most = k;
        cell = c;
      }
    }
    let entity = -1;
    let best = -Infinity;
    for (const p of s.cw.places) {
      writeVenueProfile(s.cw, p, row, 0);
      const match = cosine(row, 0, nE, sc.centroids[a]);
      if (match > best) {
        best = match;
        entity = p;
      }
    }
    return { scene: id, score, cell, entity };
  });
}

/** Opens a venue in the most underserved niche if its score reaches autoOpenScore. Returns the slot or -1. */
export function autoOpenVenue(s: SimState): number {
  if (!s.config.autoOpen || !hasVenueRoom(s)) return -1;
  const [top] = findNiches(s, 1);
  if (!top || top.entity < 0 || top.score < s.config.autoOpenScore) return -1;
  const v = addVenue(s, top.entity, top.cell, DEFAULT_VENUE_CAPACITY);
  s.nearbyVenues = buildNearbyVenues(s);
  return v;
}
