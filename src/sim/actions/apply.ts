import type { Action, ActionResult } from "@/sim/actions/schema";
import { GENOME_CAP } from "@/sim/genome";
import type { Rng } from "@/sim/rng";
import { agentsByCell, chooseFriends, seedGenome, type SimState } from "@/sim/state";
import { activeEvents, addVenue, buildNearbyVenues, hasVenueRoom } from "@/sim/venue-table";
import { DEFAULT_VENUE_CAPACITY } from "@/sim/world-index";

export const MAX_RENT = 5;

type MigrateAction = Extract<Action, { type: "migrate" }>;

/** Why `a` can't be applied to `s` right now, or null if it can. */
export function validateAction(s: SimState, a: Action): string | null {
  const nE = s.cw.nEntities;
  const nC = s.cw.nCells;
  const venueRoom = hasVenueRoom(s);
  switch (a.type) {
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
    placed.push(i);
  }
  const byCell = agentsByCell(s, s.cw.nCells);
  for (const i of placed) chooseFriends(s, i, byCell, rng);
  return placed.length;
}

/** Applies `a` if valid. Invalid actions change nothing and return ok: false with the reason. */
export function applyAction(s: SimState, a: Action, rng: Rng): ActionResult {
  const error = validateAction(s, a);
  if (error) return { ok: false, error };
  switch (a.type) {
    case "closeVenue":
      s.venueOpen[a.venue] = 0;
      s.nearbyVenues = buildNearbyVenues(s);
      return { ok: true, venue: a.venue };
    case "openVenue": {
      const venue = addVenue(s, a.entity, a.cell, a.capacity ?? DEFAULT_VENUE_CAPACITY);
      s.nearbyVenues = buildNearbyVenues(s);
      return { ok: true, venue };
    }
    case "scheduleEvent": {
      const venue = addVenue(s, a.entity, a.cell, a.capacity, s.tick + a.duration, a.reachKm);
      return { ok: true, venue };
    }
    case "migrate":
      return { ok: true, agents: migrate(s, a, rng) };
    case "rentPressure":
      for (const c of a.cells) s.cellRent[c] = Math.min(MAX_RENT, s.cellRent[c] * (1 + a.magnitude));
      return { ok: true };
  }
}
