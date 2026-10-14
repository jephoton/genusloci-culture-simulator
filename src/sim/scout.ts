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
