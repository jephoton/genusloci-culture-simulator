import type { Focus } from "./focus";
import type { VenueView } from "./venues";

export function canInspectVenue(focus: Focus, slot: number): boolean {
  return focus?.kind !== "experiment" || focus.venues.has(slot);
}

/** Prefer the scene matching the venue's own tastes over the changing visiting crowd. */
export function venueBeaconScene(view: Pick<VenueView, "identityScene" | "dominantScene">): number {
  return view.identityScene >= 0 ? view.identityScene : view.dominantScene;
}
