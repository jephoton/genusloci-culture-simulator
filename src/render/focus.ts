import type { VenueView } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { Action } from "@/sim/actions/schema";
import type { Rgb } from "@/render/palette";

export type ExperimentFocus = { kind: "experiment"; epoch: number; targets: ReadonlySet<number>; cells: ReadonlySet<number>; venues: ReadonlySet<number>; agents: ReadonlySet<number> };

/**
 * The venue race: the candidate host venues, and per agent slot the candidate it is highlighted for
 * (-1 for none). Race frames carry their own groups (tonight's event visitors), which win over these.
 */
export type RaceFocus = { kind: "race"; hosts: readonly number[]; groups: Int8Array };

/** What the player is following: one scene (from the legend) or one venue (selected on the map). */
export type Focus = { kind: "scene"; id: number } | { kind: "venue"; slot: number; agents?: ReadonlySet<number>; epoch?: number } | ExperimentFocus | RaceFocus | null;

/** Candidate colours A, B, C: bright enough to bloom against the night city. */
export const RACE_RGB: readonly Rgb[] = [[1, 0.68, 0.18], [0.2, 0.85, 1], [1, 0.36, 0.78]];
export const RACE_CSS = ["#ffad2e", "#33d9ff", "#ff5cc7"] as const;

/** Before the race: each candidate's recent visitors (an agent who visited several goes to the first). */
export function raceShortlistFocus(frame: Frame, hosts: readonly number[]): RaceFocus {
  const groups = new Int8Array(frame.alive.length).fill(-1);
  hosts.forEach((host, k) => {
    for (const a of recentVenueVisitors(frame, new Set([host]))) if (groups[a] < 0) groups[a] = k;
  });
  return { kind: "race", hosts, groups };
}

/** The candidate an agent is highlighted for under a race focus (-1 for none). */
export function raceGroup(focus: RaceFocus, frame: Frame, agent: number): number {
  return frame.race ? frame.race.group[agent] ?? -1 : focus.groups[agent] ?? -1;
}

/** Recorded visitors over the same rolling activity cycle used for venue ranking. */
export function recentVenueVisitors(frame: Frame, targets: ReadonlySet<number>): Set<number> {
  const agents = new Set<number>();
  for (let a = 0; a < frame.alive.length; a++) {
    if (!frame.alive[a]) continue;
    if (!frame.attendanceHistory && targets.has(frame.attendance[a])) { agents.add(a); continue; }
    if (frame.attendanceHistory) for (let k = 0; k < frame.ticksPerWeek; k++) {
      if (targets.has(frame.attendanceHistory[a * frame.ticksPerWeek + k])) { agents.add(a); break; }
    }
  }
  return agents;
}

export function venueFocus(frame: Frame, slot: number): NonNullable<Focus> {
  return { kind: "venue", slot, epoch: frame.epoch, agents: recentVenueVisitors(frame, new Set([slot])) };
}

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
  const agents = recentVenueVisitors(frame, targets);
  for (let i = 0; i < frame.alive.length; i++) if (frame.alive[i] && cells.has(frame.homeCell[i])) agents.add(i);
  return { kind: "experiment", epoch: frame.epoch, targets, cells, venues: new Set(targets), agents };
}

/** Keep the pre-change people visible after closure, along with their current destinations. */
export function followExperiment(focus: ExperimentFocus, frame: Frame): ExperimentFocus | null {
  if (focus.epoch !== frame.epoch) return null;
  const venues = new Set(focus.targets);
  const targets = new Set(focus.targets);
  for (let v = 0; v < frame.nVenues; v++) if (focus.cells.has(frame.venueCell[v])) { venues.add(v); targets.add(v); }
  for (const i of focus.agents) if (frame.alive[i] && frame.attendance[i] >= 0) venues.add(frame.attendance[i]);
  return { ...focus, venues, targets };
}

/** Whether an agent belongs to the focus: a member of the focused scene, or out at the focused venue. */
export function agentInFocus(focus: Focus, scene: number, attendance: number, slot?: number): boolean {
  if (!focus) return true;
  if (focus.kind === "experiment") return slot !== undefined && focus.agents.has(slot);
  if (focus.kind === "race") return slot !== undefined && focus.groups[slot] >= 0;
  if (focus.kind === "venue" && focus.agents) return slot !== undefined && focus.agents.has(slot);
  return focus.kind === "scene" ? scene === focus.id : attendance === focus.slot;
}

/** Whether a venue stays bright under the focus: the focused venue, or one the focused scene dominates. */
export function venueInFocus(focus: Focus, view: Pick<VenueView, "slot" | "dominantScene">): boolean {
  if (!focus) return true;
  if (focus.kind === "experiment") return focus.venues.has(view.slot);
  if (focus.kind === "race") return focus.hosts.includes(view.slot);
  return focus.kind === "scene" ? view.dominantScene === focus.id : view.slot === focus.slot;
}
