import type { Focus } from "./focus";
import type { Rgb } from "./palette";

export function canInspectVenue(focus: Focus, slot: number): boolean {
  return focus?.kind !== "experiment" || focus.venues.has(slot);
}

/** Case identification is separate from venue/crowd taste colouring. */
export function caseBeaconColour(isCase: boolean, crowd: Rgb): Rgb {
  return isCase ? [0.3, 0.9, 1] : crowd;
}
