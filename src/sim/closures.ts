import type { SimState } from "@/sim/state";

export type ClosureReason = "poor_health" | "manual" | "event_expired";
/** Snapshot at closure: entity/cell remain meaningful after an event slot is reused. */
export type VenueClosure = {
  venue: number;
  entity: number;
  cell: number;
  tick: number;
  reason: ClosureReason;
  weeklyVisits: number;
  capacity: number;
  effectiveCapacity: number;
  rent: number;
  health: number;
  lowTicks: number;
  lowWeeks: number;
  threshold: number;
  requiredLowWeeks: number;
};

/** Close once and retain the evidence independently of the mutable venue table. */
export function recordClosure(s: SimState, venue: number, reason: ClosureReason): VenueClosure | null {
  if (!s.venueOpen[venue]) return null;
  const rent = s.cellRent[s.venueCell[venue]];
  const closure: VenueClosure = {
    venue, entity: s.venueEntity[venue], cell: s.venueCell[venue], tick: s.tick, reason,
    weeklyVisits: s.venueWeekVisits[venue], capacity: s.venueCapacity[venue],
    effectiveCapacity: s.venueCapacity[venue] * rent, rent, health: s.venueHealth[venue],
    lowTicks: s.venueLowTicks[venue], lowWeeks: s.venueLowTicks[venue] / s.config.ticksPerWeek,
    threshold: s.config.closeThreshold, requiredLowWeeks: s.config.closeAfterTicks,
  };
  s.venueOpen[venue] = 0;
  for (const e of s.scheduledEvents) {
    if (e.status === "started" && e.venue === venue) e.status = "completed";
  }
  s.venueClosures[venue] = closure;
  s.closureEvents.push(closure);
  return closure;
}

export function closureExplanation(c: VenueClosure): string {
  if (c.reason === "manual") return "Closed by your intervention.";
  if (c.reason === "event_expired") return "The event reached its scheduled end.";
  return `Health stayed below ${Math.round(c.threshold * 100)}% for ${Number(c.lowWeeks.toFixed(1))} weeks. The last rolling week had ${c.weeklyVisits} visits against ${Math.round(c.effectiveCapacity)} rent-adjusted capacity (${c.rent.toFixed(2)}× rent).`;
}
