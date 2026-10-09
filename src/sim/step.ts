import { applyAction } from "@/sim/actions/apply";
import type { Action, ActionResult } from "@/sim/actions/schema";
import { autoOpenVenue } from "@/sim/niches";
import { createRng } from "@/sim/rng";
import { clusterAgents } from "@/sim/scenes/cluster";
import { updateLineages } from "@/sim/scenes/lineage";
import type { SimState } from "@/sim/state";
import { tallyAttendance } from "@/sim/steps/attendance";
import { applyDecay } from "@/sim/steps/decay";
import { applyDrift } from "@/sim/steps/drift";
import { applyExposure } from "@/sim/steps/exposure";
import { chooseOutings } from "@/sim/steps/outing";
import { updateVenues } from "@/sim/steps/venues";
import { buildNearbyVenues } from "@/sim/venue-table";

/**
 * One tick = one simulated week. Applies `actions` first (logging the successful ones at the current
 * tick), then runs the ecology. Mutates `s` in place and returns one result per action.
 * Deterministic: randomness comes only from s.rngState. Use cloneState() for snapshots.
 */
export function step(s: SimState, actions: readonly Action[] = []): ActionResult[] {
  const rng = createRng(s.rngState);
  const results = actions.map((action) => {
    const result = applyAction(s, action, rng);
    if (result.ok) s.log.push({ tick: s.tick, action });
    return result;
  });
  chooseOutings(s, rng);
  const roster = tallyAttendance(s);
  applyExposure(s, rng, roster);
  applyDrift(s, rng);
  applyDecay(s);
  if (updateVenues(s)) s.nearbyVenues = buildNearbyVenues(s);
  if (s.tick % s.config.sceneEvery === 0) {
    updateLineages(s.scenes, clusterAgents(s, s.scenes.centroids, rng), s.tick, s.config);
    autoOpenVenue(s);
  }
  s.tick++;
  s.rngState = rng.state();
  return results;
}
