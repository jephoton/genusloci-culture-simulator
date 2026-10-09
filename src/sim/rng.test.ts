import { describe, expect, it } from "vitest";
import { createRng } from "@/sim/rng";

describe("createRng", () => {
  it("is deterministic for a seed", () => {
    const a = createRng(42);
    const b = createRng(42);
    const seqA = Array.from({ length: 5 }, () => a.next());
    const seqB = Array.from({ length: 5 }, () => b.next());
    expect(seqA).toEqual(seqB);
  });

  it("differs across seeds", () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it("returns values in [0, 1)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("int(n) returns integers in [0, n)", () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const v = r.int(5);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(5);
    }
  });

  it("resumes exactly from state()", () => {
    const a = createRng(9);
    a.next();
    a.next();
    const resumed = createRng(a.state());
    expect(resumed.next()).toBe(a.next());
  });
});
