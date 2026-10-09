import type { VenueView } from "@/render/venues";

/** What the player is following: one scene (from the legend) or one venue (selected on the map). */
export type Focus = { kind: "scene"; id: number } | { kind: "venue"; slot: number } | null;

/** Whether an agent belongs to the focus: a member of the focused scene, or out at the focused venue. */
export function agentInFocus(focus: Focus, scene: number, attendance: number): boolean {
  if (!focus) return true;
  return focus.kind === "scene" ? scene === focus.id : attendance === focus.slot;
}

/** Whether a venue stays bright under the focus: the focused venue, or one the focused scene dominates. */
export function venueInFocus(focus: Focus, view: Pick<VenueView, "slot" | "dominantScene">): boolean {
  if (!focus) return true;
  return focus.kind === "scene" ? view.dominantScene === focus.id : view.slot === focus.slot;
}
