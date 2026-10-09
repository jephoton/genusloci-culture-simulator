import { describe, expect, it } from "vitest";
import { buildLayout, landmarkPosition } from "@/render/layout";
import { venueViews } from "@/render/venues";
import { DEFAULT_CONFIG } from "@/sim/config";
import { buildFrame } from "@/sim/frame";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const layout = buildLayout(world);

describe("venueViews", () => {
  it("describes every venue slot with name, kind and a pad position", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 0 }, 1);
    step(s);
    const { frame } = buildFrame(s, "main", 0, false);
    const views = venueViews(frame, layout, world);
    expect(views).toHaveLength(s.nVenues);
    for (const v of views) {
      expect(v.name).toBe(world.entities[v.entity].name);
      expect(v.kind).toBe(world.entities[v.entity].kind);
    }
    const byCell = new Map<number, number>();
    for (let v = 0; v < s.nVenues; v++) {
      const cell = s.venueCell[v];
      const pad = byCell.get(cell) ?? 0;
      byCell.set(cell, pad + 1);
      expect(views[v].position).toEqual(landmarkPosition(layout, cell, pad));
    }
  });

  it("picks the majority scene among tonight's visitors", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 10, agentReserve: 0 }, 1);
    const { frame } = buildFrame(s, "main", 0, false);
    frame.attendance.fill(-1);
    frame.attendance.set([0, 0, 0, 0], 0);
    frame.scene.set([7, 7, 3, 7], 0);
    const views = venueViews(frame, layout, world);
    expect(views[0].dominantScene).toBe(7);
    expect(views[1].dominantScene).toBe(-1);
  });
});
