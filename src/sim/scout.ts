import { runEventCandidates } from "@/sim/events";
import { affinityToEntity } from "@/sim/genome";
import type { SimState } from "@/sim/state";
import { distKm } from "@/sim/world-index";

export type ScoutOptions = {
  entity: number;
  /** Weeks to simulate per candidate (weeks × ticksPerWeek ticks). */
  weeks: number;
  /** Event length in weeks. */
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

/**
 * Per venue slot: how many residents within `reachKm` would want to see the act, as the sum of their
 * taste affinity to it (an artist entity, or a weighted profile for an artist the city doesn't know).
 * These are the people an event there can draw, since events carry no distance penalty within reach.
 */
export function fansNearVenues(s: SimState, act: { entity: number; profile?: { entity: number; weight: number }[] }, reachKm: number): number[] {
  const parts = act.profile?.length ? act.profile : [{ entity: act.entity, weight: 1 }];
  const total = parts.reduce((a, p) => a + p.weight, 0) || 1;
  const byCell = new Float64Array(s.cw.nCells);
  for (let i = 0; i < s.alive.length; i++) {
    if (!s.alive[i]) continue;
    let a = 0;
    for (const p of parts) a += p.weight * affinityToEntity(s.genomes, i, s.cw, p.entity);
    byCell[s.homeCell[i]] += a / total;
  }
  const out = new Array<number>(s.venueCell.length).fill(0);
  for (let v = 0; v < out.length; v++) {
    let sum = 0;
    for (let c = 0; c < byCell.length; c++) if (byCell[c] > 0 && distKm(s.cw, c, s.venueCell[v]) <= reachKm) sum += byCell[c];
    out[v] = Math.round(sum * 10) / 10;
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

/** Paired runs per scout: neighbourLoss in particular is noisy from a single run. */
export const SCOUT_RUNS = 3;

/**
 * Simulates the event at each candidate cell in forked futures, alongside a no-event baseline from the
 * same random seed, `runs` times with different seeds, and ranks the candidates on the averages. The
 * live state is never modified.
 */
export function scoutCandidates(live: SimState, cells: number[], o: ScoutOptions, runs = SCOUT_RUNS): ScoutResult[] {
  const outcomes = runEventCandidates(
    live,
    cells.map((cell) => ({ entity: o.entity, cell })),
    { weeks: o.weeks, duration: o.duration, reachKm: o.reachKm, capacity: o.capacity, nearbyKm: o.nearbyKm, runs },
  );
  return cells
    .map((cell, i): ScoutResult => {
      const { turnout, newFans, scenes, neighbourLoss } = outcomes[i];
      return { cell, turnout, newFans, scenes, neighbourLoss, score: turnout + 3 * newFans - 0.5 * neighbourLoss };
    })
    .sort((a, b) => b.score - a.score || a.cell - b.cell);
}
