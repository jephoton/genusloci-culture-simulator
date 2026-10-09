import type { SimState } from "@/sim/state";

/**
 * Venue ecology: health is an EMA of occupancy (attendance / capacity, capped at 1).
 * After the grace period, a venue below closeThreshold for closeAfterTicks consecutive ticks closes.
 */
export function updateVenues(s: SimState): void {
  const { healthAlpha, closeThreshold, closeAfterTicks, graceTicks } = s.config;
  for (let v = 0; v < s.cw.venues.length; v++) {
    if (!s.venueOpen[v]) continue;
    const occupancy = Math.min(1, s.venueAttendance[v] / s.cw.venueCapacity[v]);
    s.venueHealth[v] = (1 - healthAlpha) * s.venueHealth[v] + healthAlpha * occupancy;
    if (s.tick >= graceTicks && s.venueHealth[v] < closeThreshold) s.venueLowTicks[v]++;
    else s.venueLowTicks[v] = 0;
    if (s.venueLowTicks[v] >= closeAfterTicks) s.venueOpen[v] = 0;
  }
}
