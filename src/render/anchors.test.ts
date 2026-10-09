import { describe, expect, it } from "vitest";
import { homeScene } from "@/render/anchors";

describe("homeScene", () => {
  it("picks the most common living scene in a cell", () => {
    const frame = {
      alive: Uint8Array.from([1, 1, 1, 1, 0, 0]),
      homeCell: Int32Array.from([0, 0, 0, 1, 0, 0]),
      scene: Int32Array.from([2, 3, 3, 2, 2, 2]),
    };
    expect(homeScene(frame, 0)).toBe(3);
    expect(homeScene(frame, 1)).toBe(2);
    expect(homeScene(frame, 5)).toBe(-1);
  });
});
