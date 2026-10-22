import type { Action } from "@/sim/actions/schema";
import type { CaseReport } from "@/sim/case";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

export function caseLabel(actions: Action[], frame: Frame, world: World): string {
  return actions.map((action) => {
    if (action.type === "closeVenue") return `Close ${frame.venueLabels?.[action.venue] ?? world.entities[frame.venueEntity[action.venue]]?.name ?? "venue"}`;
    if (action.type === "openVenue") return `Open ${world.entities[action.entity]?.name ?? "venue"}`;
    if (action.type === "rentPressure") return `Raise model rent by ${Math.round(action.magnitude * 100)}%`;
    if (action.type === "scheduleEvent") return `Run ${action.label ?? world.entities[action.entity]?.name ?? "event"}`;
    if (action.type === "cancelEvent") return "Cancel the selected event";
    return `Add ${action.count} simulated residents`;
  }).join("; ");
}

export function caseSummary(report: CaseReport, label: string, world: World): string {
  const reason = report.reason === "settled" ? "The followed activity settled under the model's complete-cycle heuristic."
    : report.reason === "limit" ? "The observation limit was reached. This does not mean every effect has ended."
    : report.reason === "finished" ? "You finished the case early." : "The case was interrupted by another operation.";
  return [
    `Case finished: ${label}. ${reason}`,
    `Observed playback: ${report.observedTicks} steps.`,
    "Counts cover monitored playback after application; the already-applied change step is excluded.",
    `- Tracked venues recorded ${report.visits} simulated visits from ${report.uniqueVisitors} distinct resident slots.`,
    `- The followed resident group made ${report.cohortOutings} outings, including other destinations.`,
    ...report.venues.slice(0, 5).map((venue) => `- ${world.entities[venue.entity]?.name ?? "Tracked venue"}: ${venue.openAfter ? "open" : "closed"}; model health ${Math.round(venue.healthBefore * 100)}% → ${Math.round(venue.healthAfter * 100)}% during observation.`),
    "These are observed model outcomes after the change was applied, not measured causal differences from an unchanged city. Use Change history to rewind, or say ‘resume’ to leave this case and continue the city.",
  ].join("\n");
}
