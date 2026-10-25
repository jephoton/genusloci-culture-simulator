import { expect, it } from "vitest";
import { labIntro } from "./lab-intro";

it("explains where Qloo contributes without describing residents as observed real people", () => {
  const text = labIntro(true);
  expect(text).toContain("Qloo venue tastes, cultural affinities and heatmaps");
  expect(text).toContain("Residents and their behaviour are simulated");
  expect(text).toContain("click Play");
  expect(text).toContain("not forecasts");
});

it("does not present synthetic fallback tastes as Qloo evidence", () => {
  const text = labIntro(false);
  expect(text).toContain("synthetic fallback world");
  expect(text).toContain("not a Qloo-grounded city");
  expect(text).not.toContain("uses Qloo venue tastes");
});
