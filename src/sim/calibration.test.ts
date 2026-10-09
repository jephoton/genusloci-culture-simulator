import { describe, expect, it } from "vitest";
import { computeFidelity, ranks, spearman } from "@/sim/calibration";
import { DEFAULT_CONFIG } from "@/sim/config";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

describe("ranks / spearman", () => {
  it("averages tied ranks", () => {
    expect(Array.from(ranks([10, 20, 20, 30]))).toEqual([1, 2.5, 2.5, 4]);
  });

  it("is 1 for monotone, -1 for reversed, 0 for constant or tiny inputs", () => {
    expect(spearman([1, 2, 3, 4], [10, 20, 30, 99])).toBeCloseTo(1);
    expect(spearman([1, 2, 3, 4], [4, 3, 2, 1])).toBeCloseTo(-1);
    expect(spearman([1, 2, 3], [5, 5, 5])).toBe(0);
    expect(spearman([1], [2])).toBe(0);
  });
});

describe("computeFidelity", () => {
  const world = makeTinyWorld();
  const config = { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 0 };

  it("is high for a population seeded from the same archetypes as the heatmaps", () => {
    const f = computeFidelity(initState(world, config, 1));
    expect(f.perHeatmap).toHaveLength(world.heatmaps.length);
    expect(f.mean).toBeGreaterThan(0.7);
  });

  it("drops when agents are scattered at random", () => {
    const s = initState(world, config, 1);
    const before = computeFidelity(s).mean;
    const rng = createRng(5);
    for (let i = s.homeCell.length - 1; i > 0; i--) {
      const j = rng.int(i + 1);
      [s.homeCell[i], s.homeCell[j]] = [s.homeCell[j], s.homeCell[i]];
    }
    expect(computeFidelity(s).mean).toBeLessThan(before);
  });
});
