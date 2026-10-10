import { affinityToEntity, geneSlot } from "@/sim/genome";
import { cloneState, type SimState } from "@/sim/state";
import { step } from "@/sim/step";
import { distKm } from "@/sim/world-index";

export type ScoutOptions = {
  entity: number;
  /** Weeks to simulate per candidate. */
  weeks: number;
  duration: number;
  reachKm: number;
  capacity: number;
  /** Venues within this distance of a candidate count towards neighbourLoss. */
  nearbyKm: number;
};

export type ScoutResult = {
  cell: number;
  /** Total visits to the event across the simulated weeks. */
  turnout: number;
  /** Residents who didn't have the headliner in their taste before and do after. */
  newFans: number;
  /** Lineage ids of the scenes that came, most attendees first. */
  scenes: number[];
  /** Visits lost by nearby permanent venues compared with the no-event baseline. */
  neighbourLoss: number;
  score: number;
};

/** Per cell: summed taste-graph affinity of its residents to `entity` (who'd want to come). */
export function demandByCell(s: SimState, entity: number): number[] {
  const out = new Array<number>(s.cw.nCells).fill(0);
  for (let i = 0; i < s.alive.length; i++) {
    if (s.alive[i]) out[s.homeCell[i]] += affinityToEntity(s.genomes, i, s.cw, entity);
  }
  return out;
}

/** The `count` highest-demand cells, each at least `minKm` from those already picked. */
export function pickCandidates(s: SimState, demand: number[], count: number, minKm: number): number[] {
  const order = demand.map((d, c) => [d, c] as const).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const picks: number[] = [];
  for (const [, c] of order) {
    if (picks.length >= count) break;
    if (picks.every((p) => distKm(s.cw, p, c) >= minKm)) picks.push(c);
  }
  return picks;
}

const fansOf = (s: SimState, entity: number) => {
  const fans = new Uint8Array(s.alive.length);
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i] && geneSlot(s.genomes, i, entity) >= 0) fans[i] = 1;
  return fans;
};

/**
 * Simulates the event at each candidate cell in a forked future, alongside a no-event baseline
 * fork, and ranks the candidates. The live state is never modified.
 */
export function scoutCandidates(live: SimState, cells: number[], o: ScoutOptions): ScoutResult[] {
  const before = fansOf(live, o.entity);
  const baseline = cloneState(live);
  const baseVisits = new Float64Array(baseline.venueEntity.length);
  for (let w = 0; w < o.weeks; w++) {
    step(baseline);
    for (let v = 0; v < baseline.nVenues; v++) baseVisits[v] += baseline.venueAttendance[v];
  }

  const results = cells.map((cell): ScoutResult => {
    const s = cloneState(live);
    const [res] = step(s, [{ type: "scheduleEvent", entity: o.entity, cell, duration: o.duration, reachKm: o.reachKm, capacity: o.capacity }]);
    const slot = res.ok && res.venue !== undefined ? res.venue : -1;
    let turnout = 0;
    const sceneCounts = new Map<number, number>();
    const visits = new Float64Array(s.venueEntity.length);
    const tally = () => {
      for (let v = 0; v < s.nVenues; v++) visits[v] += s.venueAttendance[v];
      if (slot < 0) return;
      turnout += s.venueAttendance[slot];
      for (let i = 0; i < s.attendance.length; i++) {
        if (s.attendance[i] !== slot) continue;
        const a = s.scenes.assignment[i];
        if (a >= 0) {
          const id = s.scenes.live[a];
          sceneCounts.set(id, (sceneCounts.get(id) ?? 0) + 1);
        }
      }
    };
    tally();
    for (let w = 1; w < o.weeks; w++) {
      step(s);
      tally();
    }
    const after = fansOf(s, o.entity);
    let newFans = 0;
    for (let i = 0; i < after.length; i++) if (after[i] && !before[i]) newFans++;
    let neighbourLoss = 0;
    for (let v = 0; v < Math.min(s.nVenues, baseline.nVenues); v++) {
      if (v === slot || s.venueExpires[v] >= 0) continue;
      if (distKm(s.cw, cell, s.venueCell[v]) > o.nearbyKm) continue;
      neighbourLoss += Math.max(0, baseVisits[v] - visits[v]);
    }
    const scenes = [...sceneCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
    return { cell, turnout, newFans, scenes, neighbourLoss, score: turnout + 3 * newFans - 0.5 * neighbourLoss };
  });
  return results.sort((a, b) => b.score - a.score || a.cell - b.cell);
}
