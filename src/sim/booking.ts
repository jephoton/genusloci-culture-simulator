import { runEventCandidates } from "@/sim/events";
import type { SimState } from "@/sim/state";

/** An act a venue could book: an in-city artist, optionally with a taste profile (an outside artist). */
export type BookingAct = { entity: number; profile?: { entity: number; weight: number }[] };

export type BookingOptions = { weeks: number; runs: number; reachKm: number; capacity: number; nearbyKm: number };

export type BookingResult = {
  /** Index into the acts that were asked for. */
  act: number;
  turnout: number;
  /** The host venue's own visits with the act minus without: positive is a halo, negative cannibalisation. */
  hostChange: number;
  newFans: number;
  scenes: number[];
  neighbourLoss: number;
  /** Turnout plus the host's change and new fans, less half the harm to neighbours. */
  score: number;
};

/** Runs/reach shared with Scout's night, but the run length is the booking's own. */
export const BOOKING_RUNS = 3;

/**
 * "Book for my venue": runs each act as an event at the host venue (its cell) for `weeks`, next to a
 * no-event baseline, over paired seeded runs, and ranks the acts. The live state is never modified.
 */
export function bookActs(live: SimState, hostVenue: number, acts: BookingAct[], o: BookingOptions): BookingResult[] {
  const cell = live.venueCell[hostVenue];
  const outcomes = runEventCandidates(
    live,
    acts.map((a) => ({ entity: a.entity, cell, profile: a.profile })),
    { weeks: o.weeks, duration: o.weeks, reachKm: o.reachKm, capacity: o.capacity, nearbyKm: o.nearbyKm, hostVenue, runs: o.runs },
  );
  return acts
    .map((_, act): BookingResult => {
      const r = outcomes[act];
      return { act, ...r, score: r.turnout + r.hostChange + 3 * r.newFans - 0.5 * r.neighbourLoss };
    })
    .sort((a, b) => b.score - a.score || a.act - b.act);
}
