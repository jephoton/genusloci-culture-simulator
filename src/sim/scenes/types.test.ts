import { describe, expect, it } from "vitest";
import { cloneSceneState, createSceneState } from "@/sim/scenes/types";

describe("scene state", () => {
  it("starts empty with every agent unassigned", () => {
    const sc = createSceneState(4);
    expect(sc.lineages).toEqual([]);
    expect(sc.live).toEqual([]);
    expect(Array.from(sc.assignment)).toEqual([-1, -1, -1, -1]);
  });

  it("clones deeply", () => {
    const sc = createSceneState(2);
    sc.lineages.push({
      id: 0, parent: null, bornTick: 0, diedTick: null, mergedInto: null, size: 2, peakSize: 2, topEntities: [1, 2],
    });
    sc.live.push(0);
    sc.centroids.push(Float32Array.from([1, 0]));
    const c = cloneSceneState(sc);
    c.lineages[0].topEntities.push(9);
    c.lineages[0].size = 99;
    c.live.push(5);
    c.centroids[0][0] = 0;
    c.assignment[0] = 3;
    expect(sc.lineages[0].topEntities).toEqual([1, 2]);
    expect(sc.lineages[0].size).toBe(2);
    expect(sc.live).toEqual([0]);
    expect(sc.centroids[0][0]).toBe(1);
    expect(sc.assignment[0]).toBe(-1);
  });
});
