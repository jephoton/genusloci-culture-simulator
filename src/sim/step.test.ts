import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { hashState } from "@/sim/hash";
import { cloneState, initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { ...DEFAULT_CONFIG, nAgents: 400 };
const run = (seed: number, ticks: number) => {
  const s = initState(makeTinyWorld(), config, seed);
  for (let t = 0; t < ticks; t++) step(s);
  return s;
};

describe("step", () => {
  it("tracks scenes: three are born at tick 0 and survive a quiet run", () => {
    const s = run(4, 20);
    const births = s.scenes.events.filter((e) => e.kind === "birth" && e.tick === 0);
    expect(births.length).toBeGreaterThanOrEqual(3);
    expect(s.scenes.live.length).toBeGreaterThanOrEqual(3);
    for (const id of s.scenes.live) expect(s.scenes.lineages[id].topEntities.length).toBeGreaterThan(0);
  });

  it("advances the tick and the rng state", () => {
    const s = initState(makeTinyWorld(), config, 1);
    const rng0 = s.rngState;
    step(s);
    expect(s.tick).toBe(1);
    expect(s.rngState).not.toBe(rng0);
  });

  it("is deterministic: same seed gives the same hash", () => {
    expect(hashState(run(11, 15))).toBe(hashState(run(11, 15)));
  });

  it("differs across seeds", () => {
    expect(hashState(run(11, 15))).not.toBe(hashState(run(12, 15)));
  });

  it("continues identically from a clone", () => {
    const a = run(5, 5);
    const b = cloneState(a);
    for (let t = 0; t < 5; t++) {
      step(a);
      step(b);
    }
    expect(hashState(a)).toBe(hashState(b));
  });

  it("closes a venue nobody can fill", () => {
    const world = makeTinyWorld();
    const venueEntity = world.entities.findIndex((e) => e.type === "place");
    world.entities[venueEntity].capacity = 1e9;
    const s = initState(world, config, 2);
    for (let t = 0; t < 40; t++) step(s);
    const slot = Array.from(s.venueEntity.subarray(0, s.nVenues)).indexOf(venueEntity);
    expect(s.venueOpen[slot]).toBe(0);
  });

  it("keeps the population alive: agents still go out and still have tastes after 50 ticks", () => {
    const s = run(9, 50);
    expect(Array.from(s.attendance).filter((v) => v >= 0).length).toBeGreaterThan(50);
    expect(Array.from(s.genomes.ids).filter((x) => x >= 0).length).toBeGreaterThan(400);
    expect(Array.from(s.venueOpen).some((x) => x === 1)).toBe(true);
  });
});
