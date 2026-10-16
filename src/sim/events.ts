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

function onePair(live: SimState, candidates: EventCandidate[], o: EventRunOptions, seed: number): EventOutcome[] {
  const ticks = o.durationDays ?? weeksToTicks(o.weeks, live.config.ticksPerWeek);
  const atDate = cloneState(live);
  atDate.rngState = seed;
  const startTick = o.startTick ?? live.tick;
  if (!Number.isInteger(startTick) || startTick < live.tick) throw new Error("event date is in the past or invalid");
  if (startTick > live.tick + 52 * live.config.ticksPerWeek) throw new Error("event date must be within 52 weeks");
  if (!Number.isInteger(ticks) || ticks < 1 || ticks > 364) throw new Error("invalid event duration");
  if (o.durationDays !== undefined && live.config.ticksPerWeek !== 7) throw new Error("day durations require daily simulation");
  while (atDate.tick < startTick) step(atDate);
  const baseline = cloneState(atDate);
  const baseVisits = new Float64Array(baseline.venueEntity.length);
  for (let t = 0; t < ticks; t++) {
    step(baseline);
    for (let v = 0; v < baseline.nVenues; v++) baseVisits[v] += baseline.venueAttendance[v];
  }

  return candidates.map((c): EventOutcome => {
    const before = c.profile ? null : fansOf(atDate, c.entity);
    // Register at booking time so older due bookings retain their calendar priority.
    const s = cloneState(live);
    s.rngState = seed;
    const rng = createRng(s.rngState);
    const res = applyAction(s,
      { type: "scheduleEvent", entity: c.entity, cell: c.cell, startTick, duration: o.duration, durationDays: o.durationDays, hostVenue: o.hostVenue, reachKm: o.reachKm, capacity: o.capacity, ...(c.profile ? { profile: c.profile } : {}) }, rng);
    if (!res.ok) throw new Error(res.error);
    s.rngState = rng.state();
    const event = s.scheduledEvents.find((e) => e.id === res.event)!;
    while (s.tick < startTick) step(s);
    let slot = -1;
    let turnout = 0;
    const sceneCounts = new Map<number, number>();
    const visits = new Float64Array(s.venueEntity.length);
    const tally = (candidateRunning: boolean) => {
      for (let v = 0; v < s.nVenues; v++) visits[v] += s.venueAttendance[v];
      if (!candidateRunning || slot < 0) return;
      // autoOpenVenue may reuse an expired slot after outings and clear its counter.
      // The per-agent attendance still records this tick's actual event visitors.
      for (let i = 0; i < s.attendance.length; i++) {
        if (s.attendance[i] !== slot) continue;
        turnout++;
        const a = s.scenes.assignment[i];
        if (a >= 0) {
          const id = s.scenes.live[a];
          sceneCounts.set(id, (sceneCounts.get(id) ?? 0) + 1);
        }
      }
    };
    for (let t = 0; t < ticks; t++) {
      // Completion happens after attendance: include that final tick, then never count
      // this event's reusable slot again, even if another booking occupies it.
      const candidateRunning = event.status === "scheduled" || event.status === "started";
      step(s);
      if (event.status === "failed") throw new Error(event.error ?? "event failed to start");
      slot = event.venue ?? -1;
      tally(candidateRunning);
    }
    let newFans = 0;
    if (before) {
      const after = fansOf(s, c.entity);
      for (let i = 0; i < after.length; i++) if (after[i] && !before[i]) newFans++;
    }
    let neighbourLoss = 0;
    for (let v = 0; v < Math.min(s.nVenues, baseline.nVenues); v++) {
      if (v === o.hostVenue || s.venueExpires[v] >= 0) continue;
      if (distKm(s.cw, c.cell, s.venueCell[v]) > o.nearbyKm) continue;
      neighbourLoss += Math.max(0, baseVisits[v] - visits[v]);
    }
    const hostChange = o.hostVenue !== undefined && o.hostVenue < baseline.nVenues ? visits[o.hostVenue] - baseVisits[o.hostVenue] : 0;
    const scenes = [...sceneCounts.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id);
    return { turnout, newFans, scenes, neighbourLoss, hostChange };
  });
}

/** Runs every candidate over `o.runs` paired seeded runs and averages the outcomes (scenes by rank vote). */
export function runEventCandidates(live: SimState, candidates: EventCandidate[], o: EventRunOptions): EventOutcome[] {
  const all = Array.from({ length: Math.max(1, o.runs) }, (_, k) => onePair(live, candidates, o, runSeed(live, k)));
  const n = all.length;
  return candidates.map((_, i) => {
    const per = all.map((r) => r[i]);
    const avg = (f: (r: EventOutcome) => number) => per.reduce((acc, r) => acc + f(r), 0) / n;
    const votes = new Map<number, number>();
    per.forEach((r) => r.scenes.forEach((id, rank) => votes.set(id, (votes.get(id) ?? 0) + (r.scenes.length - rank))));
    return {
      turnout: avg((r) => r.turnout),
      newFans: avg((r) => r.newFans),
      scenes: [...votes].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([id]) => id),
      neighbourLoss: avg((r) => r.neighbourLoss),
      hostChange: avg((r) => r.hostChange),
    };
  });
}
