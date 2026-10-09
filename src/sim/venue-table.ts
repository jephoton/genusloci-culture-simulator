import type { SimState } from "@/sim/state";
import { distKm, writeVenueProfile } from "@/sim/world-index";

/** Lowest slot holding a closed, expired event (reusable), or -1. Permanent closed venues are history and never reused. */
function reusableSlot(s: SimState): number {
  for (let v = 0; v < s.nVenues; v++) if (s.venueOpen[v] === 0 && s.venueExpires[v] >= 0) return v;
  return -1;
}

/** True if addVenue would succeed: a closed expired event slot or an unused slot is available. */
export function hasVenueRoom(s: SimState): boolean {
  return s.nVenues < s.venueEntity.length || reusableSlot(s) >= 0;
}

/**
 * Adds a venue and returns its slot, or -1 if the table is full. Reuses the lowest closed expired
 * event slot first; otherwise appends at nVenues. Closed permanent venues are never reused.
 */
export function addVenue(
  s: SimState,
  entity: number,
  cell: number,
  capacity: number,
  expires = -1,
  reachKm = 0,
): number {
  let v = reusableSlot(s);
  if (v < 0) {
    v = s.nVenues;
    if (v >= s.venueEntity.length) return -1;
  }
  s.venueEntity[v] = entity;
  s.venueCell[v] = cell;
  s.venueCapacity[v] = capacity;
  writeVenueProfile(s.cw, entity, s.venueProfile, v * s.cw.nEntities);
  s.venueOpen[v] = 1;
  s.venueHealth[v] = 0.5;
  s.venueLowTicks[v] = 0;
  s.venueAttendance[v] = 0;
  s.venueExpires[v] = expires;
  s.venueReach[v] = reachKm;
  if (v === s.nVenues) s.nVenues = v + 1;
  return v;
}

/** Open event venues, by slot. */
export function activeEvents(s: SimState): number[] {
  const out: number[] = [];
  for (let v = 0; v < s.nVenues; v++) if (s.venueOpen[v] && s.venueExpires[v] >= 0) out.push(v);
  return out;
}

/** Per cell: open permanent venues sorted by distance (ties by slot), at most maxNearby. */
export function buildNearbyVenues(s: SimState): Int32Array[] {
  const slots: number[] = [];
  for (let v = 0; v < s.nVenues; v++) if (s.venueOpen[v] && s.venueExpires[v] < 0) slots.push(v);
  return Array.from({ length: s.cw.nCells }, (_, c) => {
    const d = new Map(slots.map((v) => [v, distKm(s.cw, c, s.venueCell[v])]));
    const order = [...slots].sort((a, b) => (d.get(a) as number) - (d.get(b) as number) || a - b);
    return Int32Array.from(order.slice(0, s.config.maxNearby));
  });
}
