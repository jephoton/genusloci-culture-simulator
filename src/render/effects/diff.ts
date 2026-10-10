import { type ClosureRules, isStruggling } from "@/render/venues";
import type { Frame } from "@/sim/frame";

export type FrameChange =
  | { kind: "venueOpened"; slot: number }
  | { kind: "venueClosed"; slot: number }
  /** A permanent venue just fell below the closure threshold: it closes soon unless visitors come back. */
  | { kind: "venueStruggling"; slot: number }
  | { kind: "eventStarted"; slot: number }
  | { kind: "eventEnded"; slot: number }
  | { kind: "sceneBorn"; scene: number; parent: number | null }
  | { kind: "sceneEnded"; scene: number; into: number | null };

/**
 * What visibly changed between two frames. Empty unless `next` directly follows `prev` in the same
 * epoch, so rewinds, re-inits and gaps never trigger effects. `rules` (the sim's closure settings)
 * decide when a venue counts as struggling.
 */
export function diffFrames(prev: Frame | null, next: Frame, rules: ClosureRules): FrameChange[] {
  if (!prev || prev.epoch !== next.epoch || next.tick !== prev.tick + 1) return [];
  const changes: FrameChange[] = [];
  for (let v = 0; v < next.nVenues; v++) {
    const isEvent = next.venueExpires[v] >= 0;
    const known = v < prev.nVenues && prev.venueEntity[v] === next.venueEntity[v] && prev.venueCell[v] === next.venueCell[v];
    const wasOpen = known && prev.venueOpen[v] === 1;
    const isOpen = next.venueOpen[v] === 1;
    if (!wasOpen && isOpen) changes.push({ kind: isEvent ? "eventStarted" : "venueOpened", slot: v });
    else if (wasOpen && !isOpen) changes.push({ kind: isEvent ? "eventEnded" : "venueClosed", slot: v });
    if (isStruggling(next, v, rules) && !(known && isStruggling(prev, v, rules))) changes.push({ kind: "venueStruggling", slot: v });
  }
  for (const e of next.sceneEvents) {
    if (e.kind === "birth") changes.push({ kind: "sceneBorn", scene: e.scene, parent: null });
    else if (e.kind === "split") changes.push({ kind: "sceneBorn", scene: e.scene, parent: e.other });
    else if (e.kind === "merge") changes.push({ kind: "sceneEnded", scene: e.scene, into: e.other });
    else changes.push({ kind: "sceneEnded", scene: e.scene, into: null });
  }
  return changes;
}
