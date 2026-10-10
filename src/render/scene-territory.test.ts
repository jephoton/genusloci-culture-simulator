import { describe, expect, it } from "vitest";
import type { CityLayout } from "@/render/layout";
import { sceneTerritories } from "@/render/scene-territory";

// spacing 0: every agent lives exactly at its cell centre, so the maths is easy to check.
const layout = {
  cellX: Float32Array.from([0, 10, 0, 100]),
  cellZ: Float32Array.from([0, 0, 10, 100]),
  spacing: 0,
} as unknown as CityLayout;

describe("sceneTerritories", () => {
  it("gives each live scene its members' centroid, RMS spread and size", () => {
    const frame = {
      alive: Uint8Array.from([1, 1, 1, 1, 1, 0, 1]),
      homeCell: Int32Array.from([0, 1, 2, 3, 3, 0, 0]),
      scene: Int32Array.from([4, 4, 4, 9, 9, 9, -1]),
    };
    const t = sceneTerritories(frame, layout);
    expect(t.map((s) => s.id)).toEqual([4, 9]);

    const a = t[0];
    expect(a.size).toBe(3);
    expect(a.x).toBeCloseTo(10 / 3);
    expect(a.z).toBeCloseTo(10 / 3);
    // Squared distances from (10/3, 10/3): 200/9, 500/9, 500/9 → mean 400/9.
    expect(a.spread).toBeCloseTo(Math.sqrt(400 / 9));

    // The dead member of scene 9 doesn't count; two members at one spot have no spread.
    expect(t[1]).toMatchObject({ id: 9, x: 100, z: 100, spread: 0, size: 2 });
  });

  it("is empty when nobody belongs to a scene", () => {
    const frame = { alive: Uint8Array.from([1, 0]), homeCell: Int32Array.from([0, 1]), scene: Int32Array.from([-1, 3]) };
    expect(sceneTerritories(frame, layout)).toEqual([]);
  });
});
