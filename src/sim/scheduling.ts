import { applyAction } from "@/sim/actions/apply";
import type { Action } from "@/sim/actions/schema";
import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";

export type EventAction = Extract<Action, { type: "scheduleEvent" }>;
export type ScheduledEvent = {
  id: number;
  startTick: number;
  action: EventAction;
  status: "scheduled" | "started" | "completed" | "cancelled" | "failed";
  venue?: number;
  error?: string;
};
export const MAX_PENDING_EVENTS = 64;

/** Due bookings use normal validation again: today's available resources can differ from booking day. */
export function startDueEvents(s: SimState, rng: Rng): void {
  for (const e of s.scheduledEvents) {
    if (e.status !== "scheduled" || e.startTick > s.tick) continue;
    const result = applyAction(s, { ...e.action, startTick: undefined }, rng, false);
    if (result.ok) { e.status = "started"; e.venue = result.venue; }
    else { e.status = "failed"; e.error = result.error; }
  }
}

export function finishEvents(s: SimState): void {
  for (const e of s.scheduledEvents) {
    if (e.status === "started" && e.venue !== undefined && !s.venueOpen[e.venue]) e.status = "completed";
  }
}
