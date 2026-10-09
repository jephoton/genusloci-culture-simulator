import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { chooseOutings } from "@/sim/steps/outing";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();

describe("chooseOutings", () => {
  it("sends nobody out when outingRate is 0", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 200, agentReserve: 0, outingRate: 0 }, 1);
    chooseOutings(s, createRng(1));
    expect(Array.from(s.attendance).every((v) => v === -1)).toBe(true);
  });

  it("sends agents only to valid, open venues", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 200, agentReserve: 0, outingRate: 1 }, 1);
    chooseOutings(s, createRng(1));
    const out = Array.from(s.attendance).filter((v) => v >= 0);
    expect(out.length).toBeGreaterThan(50);
    out.forEach((v) => expect(v).toBeLessThan(s.nVenues));
  });

  it("never picks a closed venue", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 200, agentReserve: 0, outingRate: 1 }, 1);
    s.venueOpen.fill(0);
    s.venueOpen[3] = 1;
    chooseOutings(s, createRng(2));
    Array.from(s.attendance).forEach((v) => expect([-1, 3]).toContain(v));
  });

  it("prefers venues matching the agent's taste cluster", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 0, outingRate: 1, distPenaltyPerKm: 0 }, 3);
    chooseOutings(s, createRng(3));
    const clusterOfEntity = (e: number) => Math.floor(e / 12);
    let match = 0;
    let total = 0;
    for (let i = 0; i < 600; i++) {
      const v = s.attendance[i];
      if (v < 0) continue;
      const topId = s.genomes.ids[i * 32];
      if (topId < 0) continue;
      total++;
      if (clusterOfEntity(s.venueEntity[v]) === clusterOfEntity(topId)) match++;
    }
    expect(match / total).toBeGreaterThan(0.5);
  });
});
