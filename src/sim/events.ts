import { geneSlot } from "@/sim/genome";
import { applyAction } from "@/sim/actions/apply";
import { createRng } from "@/sim/rng";
import { cloneState, type SimState } from "@/sim/state";
import { step } from "@/sim/step";
import { weeksToTicks } from "@/sim/time";
import { runSeed } from "@/sim/whatif";
import { distKm } from "@/sim/world-index";

// Shared engine for Scout (one act, several spots) and booking (one spot, several acts): each candidate
// event runs in a forked future next to a no-event baseline from the same random seed, over several
// paired runs with different seeds, and the results are averaged.

export type EventCandidate = {
  entity: number;
  cell: number;
  /** Optional taste profile replacing the entity's edges (see scheduleEvent.profile). */
  profile?: { entity: number; weight: number }[];
  /** This candidate's host venue (overrides `EventRunOptions.hostVenue`). */
  hostVenue?: number;
};

export type EventRunOptions = {
  /** Weeks to simulate (weeks × ticksPerWeek ticks). */
  weeks: number;
  /** Event length in weeks. */
  duration: number;
  reachKm: number;
  capacity: number;
  /** Venues within this distance of the event count towards neighbourLoss. */
  nearbyKm: number;
  /** A venue whose own change in visits is reported (`hostChange`) and left out of neighbourLoss. */
  hostVenue?: number;
  runs: number;
  startTick?: number;
  durationDays?: number;
};

export type EventOutcome = {
  /** Location visits over the exact event window, including the event in the with-event total. */
  hostBaseline?: number;
  hostWithEvent?: number;
  turnoutRange?: { min: number; max: number };
  /** Total visits to the event across the simulated weeks. */
  turnout: number;
  /** Residents who gained the candidate's entity as a taste (0 for profile events). */
  newFans: number;
  /** Lineage ids of the scenes that came, most attendees first. */
  scenes: number[];
  /** Visits lost by nearby permanent venues (except the host) compared with the baseline. */
  neighbourLoss: number;
  /** The host venue's visits with the event minus without (0 without a host). */
  hostChange: number;
};

export const fansOf = (s: SimState, entity: number) => {
  const fans = new Uint8Array(s.alive.length);
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i] && geneSlot(s.genomes, i, entity) >= 0) fans[i] = 1;
  return fans;
};

type Fork = {
  s: SimState;
  event: SimState["scheduledEvents"][number];
  /** The event's venue slot after the latest step, or -1. */
  slot: number;
  fansBefore: Uint8Array | null;
  turnout: number;
  /** Event visitors on the latest step. */
  tonight: number;
  sceneCounts: Map<number, number>;
  visits: Float64Array;
};

/**
 * One seeded comparison, a tick at a time: a no-event baseline and one forked future per candidate,
 * all from the same random seed. `runEventCandidates` steps it to the end; the venue race steps it
 * frame by frame, so the night a visitor watches is exactly one of the futures the forecast reports.
 */
export class PairedEventRun {
  readonly baseline: SimState;
  readonly ticks: number;
  readonly startTick: number;
  elapsed = 0;
  private readonly forks: Fork[];
  private readonly baseVisits: Float64Array;

  constructor(live: SimState, readonly candidates: EventCandidate[], private readonly o: EventRunOptions, seed: number) {
    const ticks = o.durationDays ?? weeksToTicks(o.weeks, live.config.ticksPerWeek);
    const startTick = o.startTick ?? live.tick;
    if (!Number.isInteger(startTick) || startTick < live.tick) throw new Error("event date is in the past or invalid");
    if (startTick > live.tick + 52 * live.config.ticksPerWeek) throw new Error("event date must be within 52 weeks");
    if (!Number.isInteger(ticks) || ticks < 1 || ticks > 364) throw new Error("invalid event duration");
    if (o.durationDays !== undefined && live.config.ticksPerWeek !== 7) throw new Error("day durations require daily simulation");
    this.ticks = ticks;
    this.startTick = startTick;
    const atDate = cloneState(live);
    atDate.rngState = seed;
    while (atDate.tick < startTick) step(atDate);
    this.baseline = cloneState(atDate);
    this.baseVisits = new Float64Array(this.baseline.venueEntity.length);
    this.forks = candidates.map((c): Fork => {
      const fansBefore = c.profile ? null : fansOf(atDate, c.entity);
      // Register at booking time so older due bookings retain their calendar priority.
      const s = cloneState(live);
      s.rngState = seed;
      const rng = createRng(s.rngState);
      const res = applyAction(s,
        { type: "scheduleEvent", entity: c.entity, cell: c.cell, startTick, duration: o.duration, durationDays: o.durationDays, hostVenue: c.hostVenue ?? o.hostVenue, reachKm: o.reachKm, capacity: o.capacity, ...(c.profile ? { profile: c.profile } : {}) }, rng);
      if (!res.ok) throw new Error(res.error);
      s.rngState = rng.state();
      const event = s.scheduledEvents.find((e) => e.id === res.event)!;
      while (s.tick < startTick) step(s);
      return { s, event, slot: -1, fansBefore, turnout: 0, tonight: 0, sceneCounts: new Map(), visits: new Float64Array(s.venueEntity.length) };
    });
  }

  get done(): boolean {
    return this.elapsed >= this.ticks;
  }

  /** Candidate `k`'s forked future. */
  fork(k: number): SimState {
    return this.forks[k].s;
  }

  /** Candidate `k`'s event venue slot after the latest step (-1 before it opens). */
  eventSlot(k: number): number {
    return this.forks[k].slot;
  }

  /** Event visitors per candidate: on the latest step, and in total so far. */
  tallies(): { tonight: number[]; total: number[] } {
    return { tonight: this.forks.map((f) => f.tonight), total: this.forks.map((f) => f.turnout) };
  }

  /** Advances the baseline and every fork by one tick. */
  step(): void {
    if (this.done) return;
    const b = this.baseline;
    step(b);
    for (let v = 0; v < b.nVenues; v++) this.baseVisits[v] += b.venueAttendance[v];
    for (const f of this.forks) {
      const s = f.s;
      // Completion happens after attendance: include that final tick, then never count
      // this event's reusable slot again, even if another booking occupies it.
      const candidateRunning = f.event.status === "scheduled" || f.event.status === "started";
      step(s);
      if (f.event.status === "failed") throw new Error(f.event.error ?? "event failed to start");
      f.slot = f.event.venue ?? -1;
      for (let v = 0; v < s.nVenues; v++) f.visits[v] += s.venueAttendance[v];
      f.tonight = 0;
      if (!candidateRunning || f.slot < 0) continue;
      // autoOpenVenue may reuse an expired slot after outings and clear its counter.
      // The per-agent attendance still records this tick's actual event visitors.
      for (let i = 0; i < s.attendance.length; i++) {
        if (s.attendance[i] !== f.slot) continue;
        f.tonight++;
        const a = s.scenes.assignment[i];
        if (a >= 0) {
          const id = s.scenes.live[a];
          f.sceneCounts.set(id, (f.sceneCounts.get(id) ?? 0) + 1);
        }
      }
      f.turnout += f.tonight;
    }
    this.elapsed++;
  }

  /** Outcomes so far (complete once `done`). */
  outcomes(): EventOutcome[] {
    const b = this.baseline;
    return this.forks.map((f, k): EventOutcome => {
      const c = this.candidates[k];
      const host = c.hostVenue ?? this.o.hostVenue;
      const s = f.s;
      let newFans = 0;
      if (f.fansBefore) {
        const after = fansOf(s, c.entity);
        for (let i = 0; i < after.length; i++) if (after[i] && !f.fansBefore[i]) newFans++;
      }
      let neighbourLoss = 0;
      for (let v = 0; v < Math.min(s.nVenues, b.nVenues); v++) {
        if (v === host || s.venueExpires[v] >= 0) continue;
        if (distKm(s.cw, c.cell, s.venueCell[v]) > this.o.nearbyKm) continue;
        neighbourLoss += Math.max(0, this.baseVisits[v] - f.visits[v]);
      }
      const hostChange = host !== undefined && host < b.nVenues ? f.visits[host] - this.baseVisits[host] : 0;
      const scenes = [...f.sceneCounts.entries()].sort((x, y) => y[1] - x[1] || x[0] - y[0]).map(([id]) => id);
      const hostBaseline = host === undefined ? 0 : this.baseVisits[host];
      return { turnout: f.turnout, newFans, scenes, neighbourLoss, hostChange, hostBaseline, hostWithEvent: hostBaseline + hostChange + f.turnout };
    });
  }
}

function onePair(live: SimState, candidates: EventCandidate[], o: EventRunOptions, seed: number): EventOutcome[] {
  const run = new PairedEventRun(live, candidates, o, seed);
  while (!run.done) run.step();
  return run.outcomes();
}

/** Every candidate's outcome in each of `o.runs` paired seeded runs (run k uses `runSeed(live, k)`). */
export function runEventCandidateRuns(live: SimState, candidates: EventCandidate[], o: EventRunOptions): EventOutcome[][] {
  return Array.from({ length: Math.max(1, o.runs) }, (_, k) => onePair(live, candidates, o, runSeed(live, k)));
}

/** Runs every candidate over `o.runs` paired seeded runs and averages the outcomes (scenes by rank vote). */
export function runEventCandidates(live: SimState, candidates: EventCandidate[], o: EventRunOptions): EventOutcome[] {
  const all = runEventCandidateRuns(live, candidates, o);
  const n = all.length;
  return candidates.map((_, i) => {
    const per = all.map((r) => r[i]);
    const avg = (f: (r: EventOutcome) => number) => per.reduce((acc, r) => acc + f(r), 0) / n;
    const votes = new Map<number, number>();
    per.forEach((r) => r.scenes.forEach((id, rank) => votes.set(id, (votes.get(id) ?? 0) + (r.scenes.length - rank))));
    return {
      hostBaseline: avg((r) => r.hostBaseline ?? 0),
      hostWithEvent: avg((r) => r.hostWithEvent ?? 0),
      turnoutRange: { min: Math.min(...per.map((r) => r.turnout)), max: Math.max(...per.map((r) => r.turnout)) },
      turnout: avg((r) => r.turnout),
      newFans: avg((r) => r.newFans),
      scenes: [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id),
      neighbourLoss: avg((r) => r.neighbourLoss),
      hostChange: avg((r) => r.hostChange),
    };
  });
}
