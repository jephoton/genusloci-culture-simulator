import type { Action } from "@/sim/actions/schema";
import { computeFidelity } from "@/sim/calibration";
import { geneSlot } from "@/sim/genome";
import { cloneState, type SimState } from "@/sim/state";
import { step } from "@/sim/step";
import { weeksToTicks } from "@/sim/time";

export const MAX_WHATIF_WEEKS = 26;
/** Paired runs per what-if: each pairs a with-change and a no-change future from the same random seed. */
export const WHATIF_RUNS = 4;
/** Venues listed among the biggest winners and losers. */
const SHIFTS = 5;

/** Mean and range of one quantity across runs. */
export type Spread = { mean: number; min: number; max: number };

export type SceneOutcome = {
  /** Lineage id (a scene that was live when the what-if started). */
  id: number;
  before: number;
  /** Mean size after `weeks`, without and with the actions. */
  baseline: number;
  scenario: number;
  /** Per-run difference (scenario − baseline). */
  change: Spread;
};

export type VenueShift = {
  /** Venue slot, or -1 for a venue that only exists in the no-change futures. */
  venue: number;
  entity: number;
  /** Mean total visits over the run, without and with the actions. */
  baseline: number;
  scenario: number;
  change: Spread;
  /** True when every run moved this venue the same way. */
  consistent: boolean;
};

export type WhatIfResult = {
  startTick: number;
  weeks: number;
  runs: number;
  /** One per action, applied at the first tick of the scenario (from the first run). */
  actions: ({ ok: true; venue?: number } | { ok: false; error: string })[];
  /** Scenes live at the start: their size now, and after `weeks` with and without the actions. */
  scenes: SceneOutcome[];
  /** Scenes born during the first run in each future (lineage ids are per-future, so listed separately). */
  newScenes: { baseline: { id: number; size: number; topEntities: number[] }[]; scenario: { id: number; size: number; topEntities: number[] }[] };
  /** Permanent venues open at the end of one future but not the other, with how many runs agreed. */
  venues: {
    closedOnlyInScenario: { venue: number; runs: number }[];
    closedOnlyInBaseline: { venue: number; runs: number }[];
    openedOnlyInScenario: { venue: number; runs: number }[];
  };
  /** Total visits over the run, biggest mean gains and losses against the baseline (events included). */
  winners: VenueShift[];
  losers: VenueShift[];
  /** For each event headliner in the actions: residents who hold that taste at the end of each future. */
  fans: { entity: number; before: number; baseline: number; scenario: number; change: Spread }[];
  fidelity: { baseline: number; scenario: number };
};

export function spread(values: number[]): Spread {
  if (values.length === 0) return { mean: 0, min: 0, max: 0 };
  return { mean: values.reduce((a, b) => a + b, 0) / values.length, min: Math.min(...values), max: Math.max(...values) };
}

const mean = (values: number[]) => spread(values).mean;

const fanCount = (s: SimState, entity: number) => {
  let n = 0;
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i] && geneSlot(s.genomes, i, entity) >= 0) n++;
  return n;
};

const isOpenPermanent = (s: SimState, v: number) => v < s.nVenues && s.venueOpen[v] === 1 && s.venueExpires[v] < 0;

/** Run k's random seed: run 0 continues the live sequence; later runs mix in k. */
export const runSeed = (live: SimState, k: number) => (k === 0 ? live.rngState : (live.rngState ^ Math.imul(k, 0x9e3779b9)) >>> 0);

function runFuture(live: SimState, seed: number, ticks: number, actions: readonly Action[]) {
  const s = cloneState(live);
  s.rngState = seed;
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

type Pair = { base: ReturnType<typeof runFuture>; scen: ReturnType<typeof runFuture> };

/** Per-venue visit totals of one pair, keyed by "slot:entity" so venues line up across futures and runs. */
function visitTotals(live: SimState, { base, scen }: Pair): Map<string, { venue: number; entity: number; baseline: number; scenario: number }> {
  const out = new Map<string, { venue: number; entity: number; baseline: number; scenario: number }>();
  for (let v = 0; v < scen.s.nVenues; v++) {
    const entity = scen.s.venueEntity[v];
    const same = v < base.s.nVenues && base.s.venueEntity[v] === entity;
    // A venue opened during the run may sit in different slots in different futures; key it by entity.
    const key = v < live.nVenues ? `${v}:${entity}` : `new:${entity}`;
    out.set(key, { venue: v, entity, baseline: same ? base.visits[v] : 0, scenario: scen.visits[v] });
  }
  for (let v = 0; v < base.s.nVenues; v++) {
    const entity = base.s.venueEntity[v];
    const key = v < live.nVenues ? `${v}:${entity}` : `new:${entity}`;
    if (!out.has(key)) out.set(key, { venue: -1, entity, baseline: base.visits[v], scenario: 0 });
    else if (v >= live.nVenues) out.get(key)!.baseline = base.visits[v];
  }
  return out;
}

/**
 * "What happens if…": runs `actions` on forks of the live state for `weeks`, next to no-action forks
 * from the same random seeds, `runs` times with different seeds, and compares them. Changes are
 * reported as the mean and range of the per-run difference, so noise shows up as a wide range or an
 * inconsistent sign. The live state is never modified.
 */
export function whatIf(live: SimState, actions: readonly Action[], weeks: number, runs = WHATIF_RUNS): WhatIfResult {
  const ticks = weeksToTicks(weeks, live.config.ticksPerWeek);
  const pairs: Pair[] = Array.from({ length: Math.max(1, runs) }, (_, k) => {
    const seed = runSeed(live, k);
    return { base: runFuture(live, seed, ticks, []), scen: runFuture(live, seed, ticks, actions) };
  });
  const size = (s: SimState, id: number) => (s.scenes.live.includes(id) ? s.scenes.lineages[id].size : 0);

  const scenes = live.scenes.live
    .map((id) => ({
      id,
      before: live.scenes.lineages[id].size,
      baseline: mean(pairs.map((p) => size(p.base.s, id))),
      scenario: mean(pairs.map((p) => size(p.scen.s, id))),
      change: spread(pairs.map((p) => size(p.scen.s, id) - size(p.base.s, id))),
    }))
    .sort((a, b) => b.before - a.before || a.id - b.id);

  // Venue closures/openings that differ between the futures, counted across runs.
  const tally = (pick: (p: Pair) => number[]) => {
    const counts = new Map<number, number>();
    for (const p of pairs) for (const v of pick(p)) counts.set(v, (counts.get(v) ?? 0) + 1);
    return [...counts].map(([venue, n]) => ({ venue, runs: n })).sort((a, b) => b.runs - a.runs || a.venue - b.venue);
  };
  const differing = (p: Pair, closedIn: "scen" | "base") => {
    const out: number[] = [];
    const shared = Math.min(p.base.s.nVenues, p.scen.s.nVenues, live.nVenues);
    for (let v = 0; v < shared; v++) {
      const b = isOpenPermanent(p.base.s, v);
      const sc = isOpenPermanent(p.scen.s, v);
      if (closedIn === "scen" ? b && !sc : sc && !b) out.push(v);
    }
    return out;
  };
  const openedOnlyInScenario = tally((p) => {
    const baseEntities = new Set(Array.from({ length: p.base.s.nVenues - live.nVenues }, (_, k) => p.base.s.venueEntity[live.nVenues + k]));
    const out: number[] = [];
    for (let v = live.nVenues; v < p.scen.s.nVenues; v++) {
      if (p.scen.s.venueExpires[v] < 0 && !baseEntities.has(p.scen.s.venueEntity[v])) out.push(v);
    }
    return out;
  });

  // Visit shifts, aggregated by venue across runs.
  const perRun = pairs.map((p) => visitTotals(live, p));
  const keys = new Set(perRun.flatMap((m) => [...m.keys()]));
  const shifts: VenueShift[] = [...keys].map((key) => {
    const rows = perRun.map((m) => m.get(key));
    const first = rows.find((r) => r !== undefined)!;
    const deltas = rows.map((r) => (r ? r.scenario - r.baseline : 0));
    const sign = Math.sign(mean(deltas));
    return {
      venue: first.venue,
      entity: first.entity,
      baseline: mean(rows.map((r) => r?.baseline ?? 0)),
      scenario: mean(rows.map((r) => r?.scenario ?? 0)),
      change: spread(deltas),
      consistent: sign !== 0 && deltas.every((d) => Math.sign(d) === sign),
    };
  });
  const winners = shifts.filter((x) => x.change.mean > 0).sort((a, b) => b.change.mean - a.change.mean || a.entity - b.entity).slice(0, SHIFTS);
  const losers = shifts.filter((x) => x.change.mean < 0).sort((a, b) => a.change.mean - b.change.mean || a.entity - b.entity).slice(0, SHIFTS);

  // Fans are counted for in-city headliners only; a profile event's entity is just a stand-in.
  const headliners = [...new Set(actions.flatMap((a) => (a.type === "scheduleEvent" && !a.profile ? [a.entity] : [])))];
  const fans = headliners.map((entity) => ({
    entity,
    before: fanCount(live, entity),
    baseline: mean(pairs.map((p) => fanCount(p.base.s, entity))),
    scenario: mean(pairs.map((p) => fanCount(p.scen.s, entity))),
    change: spread(pairs.map((p) => fanCount(p.scen.s, entity) - fanCount(p.base.s, entity))),
  }));

  return {
    startTick: live.tick,
    weeks,
    runs: pairs.length,
    actions: pairs[0].scen.results,
    scenes,
    newScenes: { baseline: newScenesOf(pairs[0].base.s, live.tick), scenario: newScenesOf(pairs[0].scen.s, live.tick) },
    venues: {
      closedOnlyInScenario: tally((p) => differing(p, "scen")),
      closedOnlyInBaseline: tally((p) => differing(p, "base")),
      openedOnlyInScenario,
    },
    winners,
    losers,
    fans,
    fidelity: { baseline: mean(pairs.map((p) => computeFidelity(p.base.s).mean)), scenario: mean(pairs.map((p) => computeFidelity(p.scen.s).mean)) },
  };
}
