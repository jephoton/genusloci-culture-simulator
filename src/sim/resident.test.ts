import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { residentProfile, typicalResident } from "@/sim/resident";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const s = initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 200, agentReserve: 0, sceneEvery: 1 }, 3);
for (let t = 0; t < 2; t++) step(s);

describe("residents", () => {
  it("finds a typical member of a scene and a different one when skipping", () => {
    const scene = s.scenes.live[0];
    const a = typicalResident(s, scene)!;
    const b = typicalResident(s, scene, 1)!;
    expect(a).not.toBeNull();
    expect(b).not.toBe(a);
    expect(residentProfile(s, a).scene).toBe(scene);
    expect(typicalResident(s, 9999)).toBeNull();
  });

  it("profiles a resident's tastes strongest first", () => {
    const p = residentProfile(s, 0);
    expect(p.genes.length).toBeGreaterThan(0);
    for (let i = 1; i < p.genes.length; i++) expect(p.genes[i - 1].weight).toBeGreaterThanOrEqual(p.genes[i].weight);
    expect(p.homeCell).toBe(s.homeCell[0]);
  });
});
