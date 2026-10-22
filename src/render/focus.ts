import type { VenueView } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { Action } from "@/sim/actions/schema";

export type ExperimentFocus = { kind: "experiment"; epoch: number; targets: ReadonlySet<number>; cells: ReadonlySet<number>; venues: ReadonlySet<number>; agents: ReadonlySet<number> };

/** What the player is following: one scene (from the legend) or one venue (selected on the map). */
export type Focus = { kind: "scene"; id: number } | { kind: "venue"; slot: number } | ExperimentFocus | null;

/** A bounded observed cohort, not every member of a taste scene or a causal forecast. */
export function experimentFocus(frame: Frame, actions: Action[]): ExperimentFocus {
  const targets = new Set<number>();
  const cells = new Set<number>();
  for (const action of actions) {
    if (action.type === "closeVenue") targets.add(action.venue);
    if ("cell" in action) cells.add(action.cell);
    if ("cells" in action) for (const cell of action.cells) cells.add(cell);
  }
  for (let v = 0; v < frame.nVenues; v++) if (cells.has(frame.venueCell[v])) targets.add(v);
  const agents = new Set<number>();
  for (let i = 0; i < frame.alive.length; i++) if (frame.alive[i] && (targets.has(frame.attendance[i]) || cells.has(frame.homeCell[i]))) agents.add(i);
  return { kind: "experiment", epoch: frame.epoch, targets, cells, venues: new Set(targets), agents };
}

/** Keep the pre-change people visible after closure, along with their current destinations. */
export function followExperiment(focus: ExperimentFocus, frame: Frame): ExperimentFocus | null {
  if (focus.epoch !== frame.epoch) return null;
  const venues = new Set(focus.targets);
  for (let v = 0; v < frame.nVenues; v++) if (focus.cells.has(frame.venueCell[v])) venues.add(v);
  for (const i of focus.agents) if (frame.alive[i] && frame.attendance[i] >= 0) venues.add(frame.attendance[i]);
  return { ...focus, venues };
}

/** Whether an agent belongs to the focus: a member of the focused scene, or out at the focused venue. */
export function agentInFocus(focus: Focus, scene: number, attendance: number, slot?: number): boolean {
  if (!focus) return true;
  if (focus.kind === "experiment") return slot !== undefined && focus.agents.has(slot);
  return focus.kind === "scene" ? scene === focus.id : attendance === focus.slot;
}

/** Whether a venue stays bright under the focus: the focused venue, or one the focused scene dominates. */
export function venueInFocus(focus: Focus, view: Pick<VenueView, "slot" | "dominantScene">): boolean {
  if (!focus) return true;
  if (focus.kind === "experiment") return focus.venues.has(view.slot);
  return focus.kind === "scene" ? view.dominantScene === focus.id : view.slot === focus.slot;
}
