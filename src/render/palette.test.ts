import { describe, expect, it } from "vitest";
import { hslToRgb, sceneHues, sceneRgb, UNASSIGNED_RGB } from "@/render/palette";

const hueGap = (a: number, b: number) => Math.min(Math.abs(a - b), 360 - Math.abs(a - b));

describe("palette", () => {
  it("converts HSL to RGB", () => {
    expect(hslToRgb(0, 1, 0.5).map((x) => Math.round(x * 100) / 100)).toEqual([1, 0, 0]);
    expect(hslToRgb(120, 1, 0.5).map((x) => Math.round(x * 100) / 100)).toEqual([0, 1, 0]);
  });

  it("spreads root scenes and keeps children near their parent", () => {
    const parents = Int32Array.from([-1, -1, 0, 0, 1, 2]);
    const hues = sceneHues(parents);
    expect(hueGap(hues[0], hues[1])).toBeGreaterThan(60);
    expect(hueGap(hues[2], hues[0])).toBeLessThanOrEqual(40);
    expect(hueGap(hues[3], hues[0])).toBeLessThanOrEqual(40);
    expect(hues[2]).not.toBe(hues[3]);
    expect(hueGap(hues[5], hues[2])).toBeLessThanOrEqual(40);
    expect(sceneHues(parents)).toEqual(hues);
  });

  it("colours unassigned agents grey", () => {
    expect(sceneRgb(sceneHues(Int32Array.from([-1])), -1)).toEqual(UNASSIGNED_RGB);
  });
});
