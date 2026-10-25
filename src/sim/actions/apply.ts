import type { Action, ActionResult } from "@/sim/actions/schema";
import { GENOME_CAP } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import { agentsByCell, chooseFriends, seedGenome, type SimState } from "@/sim/state";
import { weeksToTicks } from "@/sim/time";
import { activeEvents, addVenue, buildNearbyVenues, hasVenueRoom } from "@/sim/venue-table";
import { DEFAULT_VENUE_CAPACITY } from "@/sim/world-index";
import { MAX_PENDING_EVENTS } from "@/sim/scheduling";
import { recordClosure } from "@/sim/closures";

export const MAX_RENT = 5;

type MigrateAction = Extract<Action, { type: "migrate" }>;

/** Why `a` can't be applied to `s` right now, or null if it can. */
export function validateAction(s: SimState, a: Action): string | null {
  const nE = s.cw.nEntities;
  const nC = s.cw.nCells;
  const venueRoom = hasVenueRoom(s);
  switch (a.type) {
    case "cancelEvent": {
      const e = s.scheduledEvents.find((e) => e.id === a.event);
      return e && (e.status === "scheduled" || e.status === "started") ? null : "event is not scheduled or running";
    }
    case "closeVenue":
      if (a.venue >= s.nVenues) return `unknown venue ${a.venue}`;
      return s.venueOpen[a.venue] ? null : `venue ${a.venue} is already closed`;
    case "openVenue":
      if (a.entity >= nE) return `unknown entity ${a.entity}`;
      if (a.cell >= nC) return `unknown cell ${a.cell}`;
      return venueRoom ? null : "no free venue slots";
    case "scheduleEvent":
      if (a.entity >= nE) return `unknown entity ${a.entity}`;
      if (a.cell >= nC) return `unknown cell ${a.cell}`;
      if (a.profile?.some((g) => g.entity >= nE)) return "unknown entity in scheduleEvent.profile";
      if (a.durationDays !== undefined && s.config.ticksPerWeek !== 7) return "day durations require daily simulation";
      if (a.hostVenue !== undefined && (a.hostVenue >= s.nVenues || !s.venueOpen[a.hostVenue])) return "host venue is closed or unknown";
      if (a.hostVenue !== undefined && s.venueCell[a.hostVenue] !== a.cell) return "event cell does not match host venue";
      if (a.startTick !== undefined) {
        if (a.startTick < s.tick) return "event date is in the past";
        if (a.startTick > s.tick + 52 * s.config.ticksPerWeek) return "event date must be within 52 weeks";
        if (s.scheduledEvents.filter((e) => e.status === "scheduled").length >= MAX_PENDING_EVENTS) return "too many scheduled events";
        if (a.startTick > s.tick) return null;
      }
      if (!venueRoom) return "no free venue slots";
      return activeEvents(s).length >= s.config.maxEvents ? "too many active events" : null;
    case "migrate": {
      if (a.cells.some((c) => c >= nC)) return "unknown cell in migrate.cells";
      if (a.genes.some((g) => g.entity >= nE)) return "unknown entity in migrate.genes";
      let free = 0;
      for (const x of s.alive) if (!x) free++;
      return free >= a.count ? null : `only ${free} free agent slots`;
    }
    case "rentPressure":
      return a.cells.some((c) => c >= nC) ? "unknown cell in rentPressure.cells" : null;
  }
}

function migrate(s: SimState, a: MigrateAction, rng: Rng): number {
  const placed: number[] = [];
  for (let i = 0; i < s.alive.length && placed.length < a.count; i++) {
    if (s.alive[i]) continue;
    s.alive[i] = 1;
    s.homeCell[i] = a.cells[rng.int(a.cells.length)];
    s.genomes.ids.fill(-1, i * GENOME_CAP, (i + 1) * GENOME_CAP);
    s.genomes.w.fill(0, i * GENOME_CAP, (i + 1) * GENOME_CAP);
    seedGenome(s.genomes, i, a.genes, s.config.initialGenes, rng);
    s.energy[i] = 0.5 + 0.5 * rng.next();
    s.curiosity[i] = rng.next();
    s.attendance[i] = -1;
    s.attendanceHistory.fill(-1, i * s.config.ticksPerWeek, (i + 1) * s.config.ticksPerWeek);
    placed.push(i);
  }
  const byCell = agentsByCell(s, s.cw.nCells);
  for (const i of placed) chooseFriends(s, i, byCell, rng);
  return placed.length;
}

/** Applies `a` if valid. Invalid actions change nothing and return ok: false with the reason. */
export function applyAction(s: SimState, a: Action, rng: Rng, trackEvent = true): ActionResult {
  const error = validateAction(s, a);
  if (error) return { ok: false, error };
  switch (a.type) {
    case "cancelEvent": {
      const e = s.scheduledEvents.find((e) => e.id === a.event)!;
      if (e.status === "started" && e.venue !== undefined) {
        recordClosure(s, e.venue, "manual");
        s.nearbyVenues = buildNearbyVenues(s);
      }
      e.status = "cancelled";
      return { ok: true, event: e.id };
    }
    case "closeVenue":
      recordClosure(s, a.venue, "manual");
      s.nearbyVenues = buildNearbyVenues(s);
      return { ok: true, venue: a.venue };
    case "openVenue": {
      const venue = addVenue(s, a.entity, a.cell, a.capacity ?? DEFAULT_VENUE_CAPACITY);
      s.nearbyVenues = buildNearbyVenues(s);
      return { ok: true, venue };
    }
    case "scheduleEvent": {
      if (a.startTick !== undefined && a.startTick > s.tick) {
        const id = s.nextEventId++;
        s.scheduledEvents.push({ id, startTick: a.startTick, action: structuredClone(a), status: "scheduled" });
        return { ok: true, event: id };
      }
      const venue = addVenue(s, a.entity, a.cell, a.capacity, s.tick + (a.durationDays ?? weeksToTicks(a.duration, s.config.ticksPerWeek)), a.reachKm);
      s.venueLabels[venue] = a.label ?? null;
      if (a.profile && venue >= 0) {
        const nE = s.cw.nEntities;
        s.venueProfile.fill(0, venue * nE, (venue + 1) * nE);
        for (const g of a.profile) s.venueProfile[venue * nE + g.entity] = Math.max(s.venueProfile[venue * nE + g.entity], g.weight);
      }
      if (trackEvent) {
        const id = s.nextEventId++;
        s.scheduledEvents.push({ id, startTick: s.tick, action: structuredClone(a), status: "started", venue });
        if (a.startTick !== undefined) return { ok: true, venue, event: id };
      }
      return { ok: true, venue };
    }
    case "migrate":
      return { ok: true, agents: migrate(s, a, rng) };
    case "rentPressure":
      for (const c of a.cells) s.cellRent[c] = Math.min(MAX_RENT, s.cellRent[c] * (1 + a.magnitude));
      return { ok: true };
  }
}
