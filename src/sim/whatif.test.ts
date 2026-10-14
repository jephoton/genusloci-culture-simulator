import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { hashState } from "@/sim/hash";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { runSeed, spread, whatIf } from "@/sim/whatif";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const config = { ...DEFAULT_CONFIG, nAgents: 400, agentReserve: 0, sceneEvery: 2 };
const idx = (c: number, j: number) => c * 12 + j;
const warm = () => {
  const s = initState(world, config, 3);
  for (let t = 0; t < 6; t++) step(s);
  return s;
};

describe("whatIf", () => {
  it("never modifies the live state and is deterministic", () => {
    const s = warm();
    const before = hashState(s);
    const a = whatIf(s, [{ type: "closeVenue", venue: 0 }], 6);
    expect(hashState(s)).toBe(before);
    expect(whatIf(s, [{ type: "closeVenue", venue: 0 }], 6)).toEqual(a);
  });

  it("reports a closed venue only in the scenario, and its visits as a loss", () => {
    const s = warm();
    const r = whatIf(s, [{ type: "closeVenue", venue: 0 }], 6);
    expect(r.actions).toMatchObject([{ ok: true }]);
    expect(r.venues.closedOnlyInScenario).toContainEqual({ venue: 0, runs: r.runs });
    expect(r.losers[0].venue).toBe(0);
    expect(r.losers[0].scenario).toBe(0);
    expect(r.losers[0].consistent).toBe(true);
    expect(r.losers[0].change.max).toBeLessThan(0);
    expect(r.winners.length).toBeGreaterThan(0); // its crowd goes elsewhere
    expect(r.startTick).toBe(s.tick);
  });

  it("counts an event headliner's fans in both futures and lists scenes live at the start", () => {
    const s = warm();
    const r = whatIf(s, [{ type: "scheduleEvent", entity: idx(1, 6), cell: 5, duration: 3, reachKm: 50, capacity: 400 }], 4);
    expect(r.fans).toHaveLength(1);
    expect(r.fans[0].scenario).toBeGreaterThanOrEqual(r.fans[0].baseline);
    expect(r.fans[0].before).toBeGreaterThan(0);
    expect(r.scenes.map((x) => x.id).sort()).toEqual([...s.scenes.live].sort());
    expect(r.winners.some((w) => w.venue >= s.nVenues)).toBe(true); // the event itself
  });

  it("repeats the comparison with different seeds and reports the spread", () => {
    const s = warm();
    expect(new Set([0, 1, 2, 3].map((k) => runSeed(s, k))).size).toBe(4);
    expect(runSeed(s, 0)).toBe(s.rngState);
    const r = whatIf(s, [{ type: "closeVenue", venue: 0 }], 4, 3);
    expect(r.runs).toBe(3);
    for (const x of [...r.scenes.map((sc) => sc.change), ...r.winners.map((w) => w.change)]) {
      expect(x.min).toBeLessThanOrEqual(x.mean);
      expect(x.mean).toBeLessThanOrEqual(x.max);
    }
    // A no-op scenario changes nothing in any run.
    const none = whatIf(s, [{ type: "closeVenue", venue: 9999 }], 2, 2);
    expect(none.winners).toEqual([]);
    expect(none.losers).toEqual([]);
    expect(none.scenes.every((sc) => sc.change.min === 0 && sc.change.max === 0)).toBe(true);
  });

  it("summarises values as mean and range", () => {
    expect(spread([1, 3, 5])).toEqual({ mean: 3, min: 1, max: 5 });
    expect(spread([])).toEqual({ mean: 0, min: 0, max: 0 });
  });

  it("reports failed actions without throwing", () => {
    const r = whatIf(warm(), [{ type: "closeVenue", venue: 999 }], 1);
    expect(r.actions[0].ok).toBe(false);
  });
});
