import { describe, expect, it } from "vitest";
import { cellsWithin, sceneGenes } from "@/ui/area-tools";

const layout = { cellX: Float32Array.from([0, 30, 100]), cellZ: Float32Array.from([0, 0, 0]) };

describe("area tools", () => {
  it("finds cells within the radius, nearest first, and always at least one", () => {
    expect(cellsWithin(layout, 5, 0)).toEqual([0, 1]); // 400 m = 40 units
    expect(cellsWithin(layout, 200, 0)).toEqual([2]);
    expect(cellsWithin(layout, 5, 0, 100)).toEqual([0]);
  });

  it("turns a scene's top tastes into newcomer genes, strongest first", () => {
    const g = sceneGenes({ topEntities: [{ index: 7, name: "a" }, { index: 3, name: "b" }] });
    expect(g).toEqual([{ entity: 7, weight: 0.9 }, { entity: 3, weight: 0.85 }]);
  });
});
