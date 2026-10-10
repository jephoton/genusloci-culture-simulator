import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { buildFrame } from "@/sim/frame";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 20 };

describe("buildFrame", () => {
  it("copies render state with venue arrays sliced to nVenues", () => {
    const s = initState(makeTinyWorld(), config, 1);
    const { frame } = buildFrame(s, "main", 0, false, 0);
    expect(frame.tick).toBe(0);
    expect(frame.alive).toHaveLength(320);
    expect(frame.venueEntity).toHaveLength(s.nVenues);
    expect(frame.venueHealth).toHaveLength(s.nVenues);
    expect(Array.from(frame.scene).every((x) => x === -1)).toBe(true);
    expect(frame.lineageParents).toHaveLength(0);
    expect(frame.digest).toBeUndefined();
  });

  it("maps agents to scene lineage ids and carries lineage parents", () => {
    const s = initState(makeTinyWorld(), config, 1);
    step(s);
    const { frame } = buildFrame(s, "main", 0, true, 0);
    for (let i = 0; i < 300; i++) {
      const a = s.scenes.assignment[i];
      expect(frame.scene[i]).toBe(a >= 0 ? s.scenes.live[a] : -1);
    }
    expect(Array.from(frame.lineageParents)).toEqual(s.scenes.lineages.map((l) => l.parent ?? -1));
    expect(frame.digest?.tick).toBe(1);
  });

  it("returns independent copies and one distinct transferable buffer per array", () => {
    const s = initState(makeTinyWorld(), config, 1);
    const { frame, transfer } = buildFrame(s, "main", 0, false, 0);
    frame.alive[0] = 0;
    frame.venueOpen[0] = 0;
    expect(s.alive[0]).toBe(1);
    expect(s.venueOpen[0]).toBe(1);
    expect(transfer).toHaveLength(11);
    expect(new Set(transfer).size).toBe(11);
  });

  it("stamps the epoch and carries the scene events of the tick that produced it", () => {
    const s = initState(makeTinyWorld(), config, 1);
    step(s);
    const { frame } = buildFrame(s, "main", 0, false, 3);
    expect(frame.epoch).toBe(3);
    expect(frame.sceneEvents.length).toBeGreaterThan(0);
    expect(frame.sceneEvents.every((e) => e.tick === frame.tick - 1)).toBe(true);
  });
});

describe("buildFrame venue identity and week length", () => {
  it("carries ticksPerWeek from the config", () => {
    expect(buildFrame(initState(makeTinyWorld(), config, 1), "main", 0, false, 0).frame.ticksPerWeek).toBe(1);
    const daily = initState(makeTinyWorld(), { ...config, ticksPerWeek: 7 }, 1);
    expect(buildFrame(daily, "main", 0, false, 0).frame.ticksPerWeek).toBe(7);
  });

  it("has no venue scene before any scenes exist", () => {
    const s = initState(makeTinyWorld(), config, 1);
    const { frame } = buildFrame(s, "main", 0, false, 0);
    expect(frame.venueScene).toHaveLength(s.nVenues);
    expect(Array.from(frame.venueScene).every((x) => x === -1)).toBe(true);
  });

  it("gives each venue the live scene dominated by its own taste cluster", () => {
    const s = initState(makeTinyWorld(), config, 1);
    step(s);
    expect(s.scenes.live.length).toBeGreaterThanOrEqual(3);
    const { frame } = buildFrame(s, "main", 0, false, 0);
    const clusterOf = (e: number) => Math.floor(e / 12);
    const dominantCluster = (id: number) => {
      const counts = [0, 0, 0];
      for (const e of s.scenes.lineages[id].topEntities) counts[clusterOf(e)]++;
      return counts.indexOf(Math.max(...counts));
    };
    for (let v = 0; v < s.nVenues; v++) {
      expect(s.scenes.live).toContain(frame.venueScene[v]);
      expect(dominantCluster(frame.venueScene[v])).toBe(clusterOf(s.venueEntity[v]));
    }
  });
});
