import { describe, expect, it } from "vitest";
import { diffFrames } from "@/render/effects/diff";
import type { Frame } from "@/sim/frame";

function frame(overrides: Partial<Frame>): Frame {
  return {
    timeline: "main", tick: 1, earliestTick: 0, epoch: 0,
    alive: new Uint8Array(0), homeCell: new Int32Array(0), attendance: new Int32Array(0), scene: new Int32Array(0),
    lineageParents: new Int32Array(0), sceneEvents: [],
    nVenues: 3,
    venueEntity: Int32Array.from([0, 1, 2]), venueCell: Int32Array.from([0, 0, 1]),
    venueOpen: Uint8Array.from([1, 1, 1]), venueHealth: Float32Array.from([0.5, 0.5, 0.5]),
    venueAttendance: new Int32Array(3), venueExpires: Int32Array.from([-1, -1, -1]),
    ...overrides,
  };
}

describe("diffFrames", () => {
  it("ignores frames that aren't consecutive in the same epoch", () => {
    const a = frame({ tick: 1 });
    expect(diffFrames(a, frame({ tick: 3, venueOpen: Uint8Array.from([0, 1, 1]) }))).toEqual([]);
    expect(diffFrames(a, frame({ tick: 2, epoch: 1, venueOpen: Uint8Array.from([0, 1, 1]) }))).toEqual([]);
    expect(diffFrames(null, a)).toEqual([]);
  });

  it("reports venues opening, closing, and events starting and ending", () => {
    const a = frame({ tick: 1, venueOpen: Uint8Array.from([1, 0, 1]), venueExpires: Int32Array.from([-1, -1, 4]) });
    const b = frame({
      tick: 2,
      nVenues: 4,
      venueEntity: Int32Array.from([0, 1, 2, 9]),
      venueCell: Int32Array.from([0, 0, 1, 2]),
      venueOpen: Uint8Array.from([0, 1, 0, 1]),
      venueHealth: new Float32Array(4),
      venueAttendance: new Int32Array(4),
      venueExpires: Int32Array.from([-1, -1, 4, 6]),
    });
    expect(diffFrames(a, b)).toEqual([
      { kind: "venueClosed", slot: 0 },
      { kind: "venueOpened", slot: 1 },
      { kind: "eventEnded", slot: 2 },
      { kind: "eventStarted", slot: 3 },
    ]);
  });

  it("treats a reused slot with a new entity or cell as a fresh opening", () => {
    const a = frame({ tick: 1 });
    const b = frame({ tick: 2, venueEntity: Int32Array.from([0, 1, 7]) });
    expect(diffFrames(a, b)).toEqual([{ kind: "venueOpened", slot: 2 }]);
  });

  it("passes scene events through", () => {
    const b = frame({
      tick: 2,
      sceneEvents: [
        { tick: 1, kind: "birth", scene: 4, other: null },
        { tick: 1, kind: "split", scene: 5, other: 2 },
        { tick: 1, kind: "merge", scene: 1, other: 3 },
        { tick: 1, kind: "extinction", scene: 0, other: null },
      ],
    });
    expect(diffFrames(frame({ tick: 1 }), b)).toEqual([
      { kind: "sceneBorn", scene: 4, parent: null },
      { kind: "sceneBorn", scene: 5, parent: 2 },
      { kind: "sceneEnded", scene: 1, into: 3 },
      { kind: "sceneEnded", scene: 0, into: null },
    ]);
  });
});
