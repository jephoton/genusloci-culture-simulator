import { describe, expect, it } from "vitest";
import type { SimDigest } from "@/sim/digest";
import { scenesToName } from "@/ui/useSceneNames";

const digest = { scenes: [3, 4, 5].map((id) => ({ id, parent: null, bornTick: 0, size: 10, topEntities: [] })) } as unknown as SimDigest;

describe("scenesToName", () => {
  it("picks unnamed scenes that aren't busy or cooling down", () => {
    const names = new Map([[3, { id: 3, name: "A" }]]);
    const busy = new Map([[4, 2000]]);
    expect(scenesToName(digest, names, busy, 1000)).toEqual([5]);
    expect(scenesToName(digest, names, busy, 3000)).toEqual([4, 5]);
    expect(scenesToName(null, names, busy, 0)).toEqual([]);
  });
});
