import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { hashState } from "@/sim/hash";
import { demandByCell, pickCandidates, scoutCandidates } from "@/sim/scout";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const config = { ...DEFAULT_CONFIG, nAgents: 400, agentReserve: 0, autoOpen: false };
const idx = (c: number, j: number) => c * 12 + j;
const fresh = () => {
  const s = initState(world, config, 3);
  step(s);
  return s;
};

describe("demandByCell", () => {
  it("is highest where residents love the headliner's cluster", () => {
    const s = fresh();
    const d = demandByCell(s, idx(0, 5));
    expect(d).toHaveLength(world.cells.length);
    // Column 0 (col % 3 === 0) is dominated by cluster 0 in the fixture.
    const col = (c: number) => c % 4;
    const mean = (pred: (c: number) => boolean) => {
      const cs = d.map((v, c) => [v, c] as const).filter(([, c]) => pred(c));
      return cs.reduce((a, [v]) => a + v, 0) / cs.length;
    };
    expect(mean((c) => col(c) === 0)).toBeGreaterThan(mean((c) => col(c) === 1));
  });
});

describe("pickCandidates", () => {
  it("returns the strongest cells, at least minKm apart", () => {
    const s = fresh();
    const d = demandByCell(s, idx(0, 5));
    const picks = pickCandidates(s, d, 3, 0.5);
    expect(picks).toHaveLength(3);
    expect(picks[0]).toBe(d.indexOf(Math.max(...d)));
    for (let i = 0; i < picks.length; i++) {
      for (let j = i + 1; j < picks.length; j++) {
        const a = s.cw.cellLat[picks[i]] - s.cw.cellLat[picks[j]];
        const b = s.cw.cellLon[picks[i]] - s.cw.cellLon[picks[j]];
        expect(Math.hypot(a, b)).toBeGreaterThan(0);
      }
    }
  });
});

describe("scoutCandidates", () => {
  const opts = { entity: idx(0, 5), weeks: 4, duration: 3, reachKm: 25, capacity: 3000, nearbyKm: 1 };

  it("measures each candidate against a baseline without touching the live state", () => {
    const s = fresh();
    const before = hashState(s);
    const results = scoutCandidates(s, [0, 5], opts);
    expect(hashState(s)).toBe(before);
    expect(results).toHaveLength(2);
    for (const r of results) {
      expect(r.turnout).toBeGreaterThan(0);
      expect(r.newFans).toBeGreaterThanOrEqual(0);
      expect(r.neighbourLoss).toBeGreaterThanOrEqual(0);
      expect(Array.isArray(r.scenes)).toBe(true);
    }
  });

  it("is deterministic and ranks candidates by score", () => {
    const a = scoutCandidates(fresh(), [0, 5, 10], opts);
    const b = scoutCandidates(fresh(), [0, 5, 10], opts);
    expect(a).toEqual(b);
    for (let i = 1; i < a.length; i++) expect(a[i - 1].score).toBeGreaterThanOrEqual(a[i].score);
  });

  it("finds more fans for a headliner near the people who love them", () => {
    const s = fresh();
    const d = demandByCell(s, idx(0, 5));
    const best = d.indexOf(Math.max(...d));
    const worst = d.indexOf(Math.min(...d));
    // A reach inside the cell, so turnout comes from the residents whose demand was measured.
    const [first, second] = scoutCandidates(s, [best, worst], { ...opts, reachKm: 0.05 });
    expect(first.cell).toBe(best);
    expect(first.turnout).toBeGreaterThan(second.turnout);
  });
});

describe("scoutCandidates with daily ticks", () => {
  const opts = { entity: idx(0, 5), weeks: 2, duration: 3, reachKm: 25, capacity: 3000, nearbyKm: 1 };
  const freshWith = (ticksPerWeek: number) => {
    const s = initState(world, { ...config, ticksPerWeek }, 3);
    step(s);
    return s;
  };

  it("simulates `weeks` weeks of days, so turnout matches weekly ticks", () => {
    const daily = freshWith(7);
    const before = hashState(daily);
    const [dailyResult] = scoutCandidates(daily, [0], opts);
    expect(hashState(daily)).toBe(before);
    const [weeklyResult] = scoutCandidates(freshWith(1), [0], opts);
    expect(dailyResult.turnout / weeklyResult.turnout).toBeGreaterThan(0.6);
    expect(dailyResult.turnout / weeklyResult.turnout).toBeLessThan(1.6);
  });
});

describe("scoutCandidates over repeated runs", () => {
  it("averages paired runs deterministically and scores on the averages", () => {
    const s = fresh();
    const opts = { entity: idx(0, 5), weeks: 1, duration: 3, reachKm: 25, capacity: 3000, nearbyKm: 1 };
    const three = scoutCandidates(s, [0, 5], opts, 3);
    expect(scoutCandidates(s, [0, 5], opts, 3)).toEqual(three);
    expect(three.map((r) => r.cell).sort()).toEqual([0, 5]);
    for (const r of three) expect(r.score).toBeCloseTo(r.turnout + 3 * r.newFans - 0.5 * r.neighbourLoss, 6);
  });
});
