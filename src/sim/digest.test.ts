import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { digest, RECENT } from "@/sim/digest";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const config = { ...DEFAULT_CONFIG, nAgents: 400, agentReserve: 0 };

describe("digest", () => {
  it("summarises a fresh state", () => {
    const d = digest(initState(world, config, 1));
    expect(d.tick).toBe(0);
    expect(d.agents).toBe(400);
    expect(d.venues).toEqual({ open: 12, closed: 0, events: 0 });
    expect(d.scenes).toEqual([]);
    expect(d.fidelity).toBeGreaterThan(0);
  });

  it("lists living scenes largest first with entity names, plus recent actions", () => {
    const s = initState(world, config, 1);
    step(s, [{ type: "closeVenue", venue: 0 }]);
    const d = digest(s);
    expect(d.scenes.length).toBeGreaterThanOrEqual(3);
    for (let k = 1; k < d.scenes.length; k++) expect(d.scenes[k - 1].size).toBeGreaterThanOrEqual(d.scenes[k].size);
    expect(d.scenes[0].topEntities[0].name).toBe(world.entities[d.scenes[0].topEntities[0].index].name);
    expect(d.recentActions).toEqual([{ tick: 0, action: { type: "closeVenue", venue: 0 } }]);
    expect(d.venues.closed).toBeGreaterThanOrEqual(1);
    expect(d.recentSceneEvents.length).toBeLessThanOrEqual(RECENT);
  });
});
