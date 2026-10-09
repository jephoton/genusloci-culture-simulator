import type { SimState } from "@/sim/state";

/**
 * Venue ecology.
 * - Permanent venues: health is an EMA of rent-adjusted occupancy, min(1, visitors / (capacity × cell rent)).
 *   After the grace period, a venue below closeThreshold for closeAfterTicks consecutive ticks closes.
 * - Events close at the end of their last tick.
 * Returns true if any venue closed (nearby lists then need rebuilding).
 */
export function updateVenues(s: SimState): boolean {
  const { healthAlpha, closeThreshold, closeAfterTicks, graceTicks } = s.config;
  let closed = false;
  for (let v = 0; v < s.nVenues; v++) {
    if (!s.venueOpen[v]) continue;
    const effectiveCapacity = s.venueCapacity[v] * s.cellRent[s.venueCell[v]];
    const occupancy = Math.min(1, s.venueAttendance[v] / effectiveCapacity);
    s.venueHealth[v] = (1 - healthAlpha) * s.venueHealth[v] + healthAlpha * occupancy;

    if (s.venueExpires[v] >= 0) {
      if (s.tick + 1 >= s.venueExpires[v]) {
        s.venueOpen[v] = 0;
        closed = true;
      }
      continue;
    }

    if (s.tick >= graceTicks && s.venueHealth[v] < closeThreshold) s.venueLowTicks[v]++;
    else s.venueLowTicks[v] = 0;
    if (s.venueLowTicks[v] >= closeAfterTicks) {
      s.venueOpen[v] = 0;
      closed = true;
    }
  }
  return closed;
}
