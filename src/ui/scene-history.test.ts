import { describe, expect, it } from "vitest";
import type { SimDigest } from "@/sim/digest";
import { recordSizes, sparkPoints } from "@/ui/scene-history";

const digest = (tick: number, scenes: [number, number][]) =>
  ({ tick, scenes: scenes.map(([id, size]) => ({ id, size, parent: null, bornTick: 0, topEntities: [] })) }) as unknown as SimDigest;

describe("scene size history", () => {
  it("records sizes per scene and forgets the future after a rewind", () => {
    let h = recordSizes(new Map(), digest(4, [[1, 10], [2, 5]]));
    h = recordSizes(h, digest(8, [[1, 12]]));
    expect(h.get(1)).toEqual([{ tick: 4, size: 10 }, { tick: 8, size: 12 }]);
    expect(h.get(2)).toEqual([{ tick: 4, size: 5 }]);
    h = recordSizes(h, digest(6, [[1, 11]])); // rewound to tick 6
    expect(h.get(1)).toEqual([{ tick: 4, size: 10 }, { tick: 6, size: 11 }]);
  });

  it("draws a sparkline scaled to the box", () => {
    expect(sparkPoints([{ tick: 0, size: 5 }, { tick: 10, size: 10 }], 100, 20)).toBe("0.0,10.0 100.0,0.0");
    expect(sparkPoints([], 100, 20)).toBe("");
  });
});
