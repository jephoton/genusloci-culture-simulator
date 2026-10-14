import type { Action } from "@/sim/actions/schema";
import { computeFidelity } from "@/sim/calibration";
import { geneSlot } from "@/sim/genome";
import { cloneState, type SimState } from "@/sim/state";
import { step } from "@/sim/step";
import { weeksToTicks } from "@/sim/time";

export const MAX_WHATIF_WEEKS = 26;
/** Venues listed among the biggest winners and losers. */
const SHIFTS = 5;

export type SceneOutcome = {
  /** Lineage id (a scene that was live when the what-if started). */
  id: number;
  before: number;
  baseline: number;
  scenario: number;
};

export type VenueShift = { venue: number; entity: number; baseline: number; scenario: number };

export type WhatIfResult = {
  startTick: number;
  weeks: number;
  /** One per action, applied at the first tick of the scenario. */
  actions: ({ ok: true; venue?: number } | { ok: false; error: string })[];
  /** Scenes live at the start: their size now, and after `weeks` with and without the actions. */
  scenes: SceneOutcome[];
  /** Scenes born during the run in each future (lineage ids are per-future, so listed separately). */
  newScenes: { baseline: { id: number; size: number; topEntities: number[] }[]; scenario: { id: number; size: number; topEntities: number[] }[] };
  /** Permanent venues open at the end of one future but not the other (venue slots). */
  venues: { closedOnlyInScenario: number[]; closedOnlyInBaseline: number[]; openedOnlyInScenario: number[] };
  /** Total visits over the run, biggest gains and losses against the baseline (events included). */
  winners: VenueShift[];
  losers: VenueShift[];
  /** For each event headliner in the actions: residents who hold that taste at the end of each future. */
  fans: { entity: number; before: number; baseline: number; scenario: number }[];
  fidelity: { baseline: number; scenario: number };
};

const fanCount = (s: SimState, entity: number) => {
  let n = 0;
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i] && geneSlot(s.genomes, i, entity) >= 0) n++;
  return n;
};

const isOpenPermanent = (s: SimState, v: number) => v < s.nVenues && s.venueOpen[v] === 1 && s.venueExpires[v] < 0;

function runFuture(live: SimState, ticks: number, actions: readonly Action[]) {
  const s = cloneState(live);
  const visits = new Float64Array(s.venueEntity.length);
  let results: WhatIfResult["actions"] = [];
  for (let t = 0; t < ticks; t++) {
    const r = step(s, t === 0 ? actions : []);
    if (t === 0) results = r;
    for (let v = 0; v < s.nVenues; v++) visits[v] += s.venueAttendance[v];
  }
  return { s, visits, results };
}

const newScenesOf = (s: SimState, startTick: number) =>
  s.scenes.live
    .map((id) => s.scenes.lineages[id])
    .filter((l) => l.bornTick >= startTick)
    .map((l) => ({ id: l.id, size: l.size, topEntities: [...l.topEntities] }))
    .sort((a, b) => b.size - a.size || a.id - b.id);

/**
 * "What happens if…": runs `actions` on a fork for `weeks` alongside a no-action baseline fork from the
 * same state, and compares them. The live state is never modified.
 */
export function whatIf(live: SimState, actions: readonly Action[], weeks: number): WhatIfResult {
  const ticks = weeksToTicks(weeks, live.config.ticksPerWeek);
  const base = runFuture(live, ticks, []);
  const scen = runFuture(live, ticks, actions);
  const size = (s: SimState, id: number) => (s.scenes.live.includes(id) ? s.scenes.lineages[id].size : 0);

  const scenes = live.scenes.live
    .map((id) => ({ id, before: live.scenes.lineages[id].size, baseline: size(base.s, id), scenario: size(scen.s, id) }))
    .sort((a, b) => b.before - a.before || a.id - b.id);

  const shared = Math.min(base.s.nVenues, scen.s.nVenues);
  const closedOnlyInScenario: number[] = [];
  const closedOnlyInBaseline: number[] = [];
  for (let v = 0; v < shared; v++) {
    const b = isOpenPermanent(base.s, v);
    const sc = isOpenPermanent(scen.s, v);
    if (b && !sc && base.s.venueEntity[v] === scen.s.venueEntity[v]) closedOnlyInScenario.push(v);
    if (sc && !b && base.s.venueEntity[v] === scen.s.venueEntity[v]) closedOnlyInBaseline.push(v);
  }
  const openedOnlyInScenario: number[] = [];
  for (let v = live.nVenues; v < scen.s.nVenues; v++) {
    if (scen.s.venueExpires[v] >= 0) continue;
    const entity = scen.s.venueEntity[v];
    const inBase = Array.from({ length: base.s.nVenues - live.nVenues }, (_, k) => live.nVenues + k).some((u) => base.s.venueEntity[u] === entity);
    if (!inBase) openedOnlyInScenario.push(v);
  }

  // Visit shifts per venue slot: slots present before the run line up across futures; slots added in
  // one future are compared only when the same entity sits there in both.
  const shifts: VenueShift[] = [];
  for (let v = 0; v < scen.s.nVenues; v++) {
    const entity = scen.s.venueEntity[v];
    const same = v < base.s.nVenues && base.s.venueEntity[v] === entity;
    const baseline = same ? base.visits[v] : 0;
    const scenario = scen.visits[v];
    if (baseline !== scenario) shifts.push({ venue: v, entity, baseline, scenario });
  }
  for (let v = 0; v < base.s.nVenues; v++) {
    if (v < scen.s.nVenues && scen.s.venueEntity[v] === base.s.venueEntity[v]) continue;
    if (base.visits[v] > 0) shifts.push({ venue: -1, entity: base.s.venueEntity[v], baseline: base.visits[v], scenario: 0 });
  }
  const delta = (x: VenueShift) => x.scenario - x.baseline;
  const winners = shifts.filter((x) => delta(x) > 0).sort((a, b) => delta(b) - delta(a) || a.entity - b.entity).slice(0, SHIFTS);
  const losers = shifts.filter((x) => delta(x) < 0).sort((a, b) => delta(a) - delta(b) || a.entity - b.entity).slice(0, SHIFTS);

  const headliners = [...new Set(actions.flatMap((a) => (a.type === "scheduleEvent" ? [a.entity] : [])))];
  const fans = headliners.map((entity) => ({ entity, before: fanCount(live, entity), baseline: fanCount(base.s, entity), scenario: fanCount(scen.s, entity) }));

  return {
    startTick: live.tick,
    weeks,
    actions: scen.results,
    scenes,
    newScenes: { baseline: newScenesOf(base.s, live.tick), scenario: newScenesOf(scen.s, live.tick) },
    venues: { closedOnlyInScenario, closedOnlyInBaseline, openedOnlyInScenario },
    winners,
    losers,
    fans,
    fidelity: { baseline: computeFidelity(base.s).mean, scenario: computeFidelity(scen.s).mean },
  };
}
