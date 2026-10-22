import { expect, it } from "vitest";
import { CasePresentation } from "./case-presentation";
import type { CaseReport } from "@/sim/case";

const report = { id: "case", reason: "limit", observedTicks: 5 } as CaseReport;
it("lets the final outing animate before publishing outcomes, using pausable clock time", () => {
  const presentation = new CasePresentation();
  expect(presentation.begin(report, 100, 1000)).toBeNull();
  expect(presentation.take(100)).toBeNull();
  expect(presentation.take(1099)).toBeNull();
  expect(presentation.take(1100)).toBe(report);
  expect(presentation.take(1200)).toBeNull();
});
it("waits for the renderer when speed changes leave the final walk unfinished", () => {
  const presentation = new CasePresentation();
  presentation.begin(report, 0, 250);
  presentation.rescale(125, 4);
  expect(presentation.take(625, false)).toBeNull();
  expect(presentation.take(1000, true)).toBe(report);
});
it("rescales remaining animation time and cancels safely on rewind", () => {
  const presentation = new CasePresentation();
  presentation.begin(report, 0, 1000);
  presentation.rescale(500, 0.5);
  expect(presentation.take(749)).toBeNull();
  expect(presentation.take(750)).toBe(report);
  presentation.begin(report, 0, 1000); presentation.cancel();
  expect(presentation.pending).toBe(false);
  expect(presentation.take(5000)).toBeNull();
});
