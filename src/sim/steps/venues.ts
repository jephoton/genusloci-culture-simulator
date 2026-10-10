import type { SimState } from "@/sim/state";
import { perTick, weeksToTicks } from "@/sim/time";

/**
 * Venue ecology.
 * - Permanent venues: health is an EMA of rent-adjusted occupancy, min(1, visitors over the last week /
 *   (capacity × cell rent)), so a quiet weekday can't sink a venue that fills up at the weekend.
 *   After the grace period, a venue below closeThreshold for closeAfterTicks consecutive weeks closes.
 * - Rates and durations are weekly; they are converted to ticks with config.ticksPerWeek.
 * - Events close at the end of their last tick.
 * Returns true if any venue closed (nearby lists then need rebuilding).
 */
export function updateVenues(s: SimState): boolean {
  const { closeThreshold, ticksPerWeek: tpw } = s.config;
  const healthAlpha = perTick(s.config.healthAlpha, tpw);
  const graceTicks = weeksToTicks(s.config.graceTicks, tpw);
  const closeAfterTicks = weeksToTicks(s.config.closeAfterTicks, tpw);
  const ring = s.tick % tpw;
  let closed = false;
  for (let v = 0; v < s.nVenues; v++) {
    if (!s.venueOpen[v]) continue;
    const slot = v * tpw + ring;
    s.venueWeekVisits[v] += s.venueAttendance[v] - s.venueVisitHistory[slot];
    s.venueVisitHistory[slot] = s.venueAttendance[v];
    const effectiveCapacity = s.venueCapacity[v] * s.cellRent[s.venueCell[v]];
    const occupancy = Math.min(1, s.venueWeekVisits[v] / effectiveCapacity);
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
