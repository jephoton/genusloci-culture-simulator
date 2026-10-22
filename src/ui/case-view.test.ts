import { expect, it } from "vitest";
import { canInspectVenue, caseBeaconColour } from "@/render/case-view";
import type { ExperimentFocus } from "@/render/focus";

it("allows only focused venues during a case without requiring a new focus", () => {
  const focus: ExperimentFocus = { kind: "experiment", epoch: 1, venues: new Set([2]), targets: new Set([2]), cells: new Set(), agents: new Set() };
  expect(canInspectVenue(focus, 2)).toBe(true);
  expect(canInspectVenue(focus, 3)).toBe(false);
  expect(canInspectVenue(null, 3)).toBe(true);
});

it("gives case markers one stable colour independent of crowd tastes", () => {
  expect(caseBeaconColour(true, [1, 0, 0])).toEqual(caseBeaconColour(true, [0, 0, 1]));
  expect(caseBeaconColour(false, [1, 0, 0])).toEqual([1, 0, 0]);
});
