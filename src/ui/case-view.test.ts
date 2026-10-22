import { expect, it } from "vitest";
import { canInspectVenue, venueBeaconScene } from "@/render/case-view";
import type { ExperimentFocus } from "@/render/focus";

it("allows only focused venues during a case without requiring a new focus", () => {
  const focus: ExperimentFocus = { kind: "experiment", epoch: 1, venues: new Set([2]), targets: new Set([2]), cells: new Set(), agents: new Set() };
  expect(canInspectVenue(focus, 2)).toBe(true);
  expect(canInspectVenue(focus, 3)).toBe(false);
  expect(canInspectVenue(null, 3)).toBe(true);
});

it("colours target beacons by the venue's matching scene, including closed targets", () => {
  expect(venueBeaconScene({ identityScene: 4, dominantScene: 8 })).toBe(4);
  expect(venueBeaconScene({ identityScene: 4, dominantScene: -1 })).toBe(4);
  expect(venueBeaconScene({ identityScene: 7, dominantScene: 8 })).toBe(7);
  expect(venueBeaconScene({ identityScene: -1, dominantScene: 8 })).toBe(8);
  expect(venueBeaconScene({ identityScene: -1, dominantScene: -1 })).toBe(-1);
});
