import { createRng } from "@/sim/rng";
import type { SimState } from "@/sim/state";
import { tallyAttendance } from "@/sim/steps/attendance";
import { applyDecay } from "@/sim/steps/decay";
import { applyDrift } from "@/sim/steps/drift";
import { applyExposure } from "@/sim/steps/exposure";
import { chooseOutings } from "@/sim/steps/outing";
import { updateVenues } from "@/sim/steps/venues";
import { buildNearbyVenues } from "@/sim/venue-table";

/**
 * One tick = one simulated week. Mutates `s` in place and returns it.
 * Deterministic: randomness comes only from s.rngState. Use cloneState() for snapshots.
 */
export function step(s: SimState): SimState {
  const rng = createRng(s.rngState);
  chooseOutings(s, rng);
  const roster = tallyAttendance(s);
  applyExposure(s, rng, roster);
  applyDrift(s, rng);
  applyDecay(s);
  if (updateVenues(s)) s.nearbyVenues = buildNearbyVenues(s);
  s.tick++;
  s.rngState = rng.state();
  return s;
}
