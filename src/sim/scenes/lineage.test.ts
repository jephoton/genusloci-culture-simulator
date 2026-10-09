import { describe, expect, it } from "vitest";
import type { Clustering } from "@/sim/scenes/cluster";
import { updateLineages } from "@/sim/scenes/lineage";
import { createSceneState } from "@/sim/scenes/types";

const shares = { splitShare: 0.3, mergeShare: 0.3 };
const vec = (...xs: number[]) => Float32Array.from(xs);

/** Builds a clustering from a per-agent assignment (with -1 = unassigned) and one centroid per cluster. */
function clustering(assignment: number[], centroids: Float32Array[]): Clustering {
  const sizes = centroids.map((_, c) => assignment.filter((a) => a === c).length);
  return { centroids, assignment: Int32Array.from(assignment), sizes };
}

describe("updateLineages", () => {
  it("records births on the first run, with top entities from the centroid", () => {
    const sc = createSceneState(4);
    updateLineages(sc, clustering([0, 0, 1, 1], [vec(0.1, 0.9, 0), vec(0, 0, 1)]), 0, shares);
    expect(sc.live).toEqual([0, 1]);
    expect(sc.events.map((e) => e.kind)).toEqual(["birth", "birth"]);
    expect(sc.lineages[0].topEntities).toEqual([1, 0]);
    expect(sc.lineages[0].size).toBe(2);
  });

  it("keeps ids stable when membership continues", () => {
    const sc = createSceneState(4);
    updateLineages(sc, clustering([0, 0, 1, 1], [vec(1, 0), vec(0, 1)]), 0, shares);
    updateLineages(sc, clustering([1, 1, 0, 0], [vec(0, 1), vec(1, 0)]), 4, shares);
    expect(sc.live).toEqual([1, 0]);
    expect(sc.events).toHaveLength(2);
  });

  it("records a split with the parent lineage", () => {
    const sc = createSceneState(10);
    updateLineages(sc, clustering(Array(10).fill(0), [vec(1, 0)]), 0, shares);
    updateLineages(sc, clustering([0, 0, 0, 0, 0, 0, 1, 1, 1, 1], [vec(1, 0), vec(0, 1)]), 4, shares);
    expect(sc.live[0]).toBe(0);
    expect(sc.lineages[sc.live[1]].parent).toBe(0);
    expect(sc.events.at(-1)).toEqual({ tick: 4, kind: "split", scene: sc.live[1], other: 0 });
  });

  it("records a merge when a scene's members join another scene", () => {
    const sc = createSceneState(10);
    updateLineages(sc, clustering([0, 0, 0, 0, 0, 0, 1, 1, 1, 1], [vec(1, 0), vec(0, 1)]), 0, shares);
    updateLineages(sc, clustering(Array(10).fill(0), [vec(1, 0)]), 4, shares);
    expect(sc.live).toEqual([0]);
    expect(sc.lineages[1].diedTick).toBe(4);
    expect(sc.lineages[1].mergedInto).toBe(0);
    expect(sc.events.at(-1)).toEqual({ tick: 4, kind: "merge", scene: 1, other: 0 });
  });

  it("records an extinction when members scatter or leave", () => {
    const sc = createSceneState(4);
    updateLineages(sc, clustering([0, 0, 1, 1], [vec(1, 0), vec(0, 1)]), 0, shares);
    updateLineages(sc, clustering([0, 0, -1, -1], [vec(1, 0)]), 4, shares);
    expect(sc.lineages[1].diedTick).toBe(4);
    expect(sc.lineages[1].mergedInto).toBeNull();
    expect(sc.events.at(-1)?.kind).toBe("extinction");
  });

  it("records a fresh birth for a cluster of previously unassigned agents", () => {
    const sc = createSceneState(6);
    updateLineages(sc, clustering([0, 0, 0, -1, -1, -1], [vec(1, 0)]), 0, shares);
    updateLineages(sc, clustering([0, 0, 0, 1, 1, 1], [vec(1, 0), vec(0, 1)]), 4, shares);
    expect(sc.lineages[sc.live[1]].parent).toBeNull();
    expect(sc.events.at(-1)?.kind).toBe("birth");
  });
});
