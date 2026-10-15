import { describe, expect, it } from "vitest";
import { bookActs } from "@/sim/booking";
import { DEFAULT_CONFIG } from "@/sim/config";
import { hashState } from "@/sim/hash";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const idx = (c: number, j: number) => c * 12 + j;
const opts = { weeks: 2, runs: 2, reachKm: 25, capacity: 3000, nearbyKm: 1 };
const fresh = () => {
  const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 400, agentReserve: 0, autoOpen: false }, 3);
  step(s);
  return s;
};

describe("bookActs", () => {
  it("previews the booked day and exact duration rather than a whole immediate week", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 400, ticksPerWeek: 7, autoOpen: false }, 3);
    step(s);
    const acts = [{ entity: idx(0, 5) }];
    const [night] = bookActs(s, 0, acts, { ...opts, startTick: s.tick + 4, durationDays: 1 });
    const [week] = bookActs(s, 0, acts, { ...opts, startTick: s.tick + 4, durationDays: 7 });
    expect(night.turnout).toBeGreaterThan(0);
    expect(week.turnout).toBeGreaterThan(night.turnout);
    expect(() => bookActs(s, 0, acts, { ...opts, startTick: s.tick - 1 })).toThrow(/past/);
    expect(s.scheduledEvents).toEqual([]);
  });
  it("ranks acts at the host venue without touching the live city, deterministically", () => {
    const s = fresh();
    const before = hashState(s);
    const host = 0; // a cluster-0 venue
    const acts = [{ entity: idx(0, 5) }, { entity: idx(2, 6) }];
    const r = bookActs(s, host, acts, opts);
    expect(hashState(s)).toBe(before);
    expect(r.map((x) => x.act).sort()).toEqual([0, 1]);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].score).toBeGreaterThanOrEqual(r[i].score);
    expect(bookActs(s, host, acts, opts)).toEqual(r);
    for (const x of r) expect(x.score).toBeCloseTo(x.turnout + x.hostChange + 3 * x.newFans - 0.5 * x.neighbourLoss, 6);
  });

  it("simulates an outside act from a taste profile, with no fans of the proxy entity counted", () => {
    const s = fresh();
    const profile = [{ entity: idx(0, 6), weight: 1 }, { entity: idx(0, 7), weight: 0.8 }];
    const [r] = bookActs(s, 0, [{ entity: idx(0, 5), profile }], opts);
    expect(r.turnout).toBeGreaterThan(0);
    expect(r.newFans).toBe(0);
  });
});
