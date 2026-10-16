import { describe, expect, it } from "vitest";
import type { Frame } from "@/sim/frame";
import { plannerSnapshot, samePlannerSnapshot, SceneNameCache } from "@/ui/timeline-state";
const frame = (overrides: Partial<Frame> = {}) => ({ epoch: 1, tick: 10, nVenues: 1, venueEntity: new Int32Array([2]), venueCell: new Int32Array([3]), venueOpen: new Uint8Array([1]), lineageParents: new Int32Array([-1, 0]), ...overrides }) as Frame;
describe("planner timeline snapshot", () => {
  it("rejects missing/closed hosts and changed snapshots before callbacks access them", () => {
    const original = plannerSnapshot(frame(), 0);
    expect(original).not.toBeNull();
    expect(samePlannerSnapshot(original, frame(), 0)).toBe(true);
    for (const f of [frame({ epoch: 2 }), frame({ tick: 9 }), frame({ nVenues: 0 }), frame({ venueEntity: new Int32Array([4]) }), frame({ venueCell: new Int32Array([4]) }), frame({ venueOpen: new Uint8Array([0]) })]) expect(samePlannerSnapshot(original, f, 0)).toBe(false);
    expect(plannerSnapshot(frame(), -1)).toBeNull();
  });
});
describe("scene name timeline cache", () => {
  it("keeps ancestor names but drops discarded future names and cooldowns on rewind", () => {
    const c = new SceneNameCache();
    c.sync(frame());
    c.names.set(0, { id: 0, name: "Ancestor" });
    c.names.set(1, { id: 1, name: "Discarded" });
    c.busy.set(1, 9999);
    c.sync(frame({ epoch: 2, tick: 4, lineageParents: new Int32Array([-1]) }));
    expect([...c.names.keys()]).toEqual([0]);
    expect(c.busy.size).toBe(0);
    c.sync(frame({ epoch: 2, tick: 10 }));
    expect(c.names.has(1)).toBe(false);
  });
  it("rejects old async results even when an ID is reused and cleans up on disposal", () => {
    const c = new SceneNameCache(); c.sync(frame());
    const generation = c.generation;
    c.sync(frame({ epoch: 2, tick: 5 }));
    expect(c.accept(generation, [1], [{ id: 1, name: "Old future" }])).toBe(false);
    expect(c.accept(c.generation, [0], [{ id: 1, name: "Unrequested" }])).toBe(true);
    expect(c.names.size).toBe(0);
    c.dispose();
    expect(c.accept(c.generation - 1, [0], [{ id: 0, name: "Late" }])).toBe(false);
  });
});
