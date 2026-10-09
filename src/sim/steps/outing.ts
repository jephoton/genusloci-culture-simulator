import { venueAffinity } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";
import { distKm } from "@/sim/world-index";

/**
 * Each agent may go out and picks a venue by softmax over taste affinity, distance and friends.
 * Candidates are open nearby venues plus venues friends attended last tick.
 * Writes the new s.attendance (friend lookups use the previous tick's attendance).
 */
export function chooseOutings(s: SimState, rng: Rng): void {
  const { cw, config, genomes } = s;
  const n = s.homeCell.length;
  const F = config.friendsPerAgent;
  const prev = s.attendance;
  const next = new Int32Array(n).fill(-1);
  const cand = new Int32Array(config.maxNearby + F);
  const scores = new Float64Array(cand.length);

  for (let i = 0; i < n; i++) {
    if (rng.next() >= config.outingRate * s.energy[i]) continue;
    const home = s.homeCell[i];

    let m = 0;
    for (const v of cw.nearbyVenues[home]) if (s.venueOpen[v]) cand[m++] = v;
    for (let f = 0; f < F; f++) {
      const friend = s.friends[i * F + f];
      if (friend < 0) continue;
      const fv = prev[friend];
      if (fv < 0 || !s.venueOpen[fv]) continue;
      let dup = false;
      for (let j = 0; j < m; j++) if (cand[j] === fv) dup = true;
      if (!dup) cand[m++] = fv;
    }
    if (m === 0) continue;

    let total = 0;
    for (let j = 0; j < m; j++) {
      const v = cand[j];
      let friendsThere = 0;
      for (let f = 0; f < F; f++) {
        const friend = s.friends[i * F + f];
        if (friend >= 0 && prev[friend] === v) friendsThere++;
      }
      const score = Math.exp(
        config.beta * venueAffinity(genomes, i, cw, v) -
          config.distPenaltyPerKm * distKm(cw, home, cw.venueCell[v]) +
          config.friendBonus * (friendsThere / F),
      );
      scores[j] = score;
      total += score;
    }

    let r = rng.next() * total;
    let pick = cand[m - 1];
    for (let j = 0; j < m; j++) {
      r -= scores[j];
      if (r < 0) {
        pick = cand[j];
        break;
      }
    }
    next[i] = pick;
  }
  s.attendance = next;
}
