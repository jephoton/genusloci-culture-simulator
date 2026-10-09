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
    const { frame } = buildFrame(s, "main", 0, false);
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
    const { frame } = buildFrame(s, "main", 0, true);
    for (let i = 0; i < 300; i++) {
      const a = s.scenes.assignment[i];
      expect(frame.scene[i]).toBe(a >= 0 ? s.scenes.live[a] : -1);
    }
    expect(Array.from(frame.lineageParents)).toEqual(s.scenes.lineages.map((l) => l.parent ?? -1));
    expect(frame.digest?.tick).toBe(1);
  });

  it("returns independent copies and one distinct transferable buffer per array", () => {
    const s = initState(makeTinyWorld(), config, 1);
    const { frame, transfer } = buildFrame(s, "main", 0, false);
    frame.alive[0] = 0;
    frame.venueOpen[0] = 0;
    expect(s.alive[0]).toBe(1);
    expect(s.venueOpen[0]).toBe(1);
    expect(transfer).toHaveLength(11);
    expect(new Set(transfer).size).toBe(11);
  });
});
