import { describe, expect, it } from "vitest";
import { ARRIVE_AT, outingPhase, RETURN_AT, staggerOf } from "@/render/outing-path";

describe("outingPhase", () => {
  it("starts at home, reaches the venue mid-week and is home again by the end", () => {
    expect(outingPhase(0, 0)).toEqual({ out: 0, back: 0 });
    const mid = outingPhase((ARRIVE_AT + RETURN_AT) / 2, 0);
    expect(mid).toEqual({ out: 1, back: 0 });
    expect(outingPhase(1, 0)).toEqual({ out: 1, back: 1 });
  });

  it("is monotonic over the week", () => {
    let prev = { out: 0, back: 0 };
    for (let t = 0; t <= 1; t += 0.01) {
      const p = outingPhase(t, 0.1);
      expect(p.out).toBeGreaterThanOrEqual(prev.out);
      expect(p.back).toBeGreaterThanOrEqual(prev.back);
      prev = p;
    }
  });

  it("staggers departures so agents leave in waves, but everyone is home at the end", () => {
    const early = outingPhase(0.2, staggerOf(1));
    const late = outingPhase(0.2, staggerOf(2));
    expect(early.out).not.toBe(late.out);
    for (let i = 0; i < 200; i++) expect(outingPhase(1, staggerOf(i))).toEqual({ out: 1, back: 1 });
  });

  it("clamps out-of-range phases", () => {
    expect(outingPhase(-1, 0)).toEqual({ out: 0, back: 0 });
    expect(outingPhase(5, 0)).toEqual({ out: 1, back: 1 });
  });
});
