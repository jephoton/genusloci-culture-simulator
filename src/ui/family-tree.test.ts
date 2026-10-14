import { describe, expect, it } from "vitest";
import { familyRows } from "@/ui/family-tree";

describe("familyRows", () => {
  it("nests live scenes under their ancestors, keeping faded ancestors, biggest families first", () => {
    // 0 (faded) → 1 (live, 50), 2 (live, 30); 3 root (live, 100); 4 faded with no live descendants
    const parents = [-1, 0, 0, -1, -1];
    const rows = familyRows(parents, [
      { id: 1, size: 50 },
      { id: 2, size: 30 },
      { id: 3, size: 100 },
    ]);
    expect(rows).toEqual([
      { id: 3, depth: 0, live: true, size: 100 },
      { id: 0, depth: 0, live: false, size: 0 },
      { id: 1, depth: 1, live: true, size: 50 },
      { id: 2, depth: 1, live: true, size: 30 },
    ]);
  });

  it("returns nothing without live scenes", () => {
    expect(familyRows([-1, 0], [])).toEqual([]);
  });
});
