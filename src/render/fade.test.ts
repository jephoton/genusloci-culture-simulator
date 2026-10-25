import { expect, it } from "vitest";
import { distanceFade } from "@/render/fade";

it("keeps details full near the camera and fades them smoothly to nothing far away", () => {
  expect(distanceFade(10, 100, 200)).toBe(1);
  expect(distanceFade(150, 100, 200)).toBeCloseTo(0.5);
  expect(distanceFade(190, 100, 200)).toBeLessThan(0.05);
  expect(distanceFade(250, 100, 200)).toBe(0);
});
