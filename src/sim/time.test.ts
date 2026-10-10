import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { perTick, weekdayFactor, weeksToTicks } from "@/sim/time";

describe("perTick", () => {
  it("is the identity with weekly ticks", () => {
    for (const p of [0, 0.02, 0.45, 1]) expect(perTick(p, 1)).toBe(p);
  });

  it("compounds over a week back to the weekly probability", () => {
    const daily = perTick(0.45, 7);
    expect(daily).toBeLessThan(0.45);
    expect(1 - (1 - daily) ** 7).toBeCloseTo(0.45, 10);
  });

  it("clamps out-of-range probabilities", () => {
    expect(perTick(1.5, 7)).toBe(1);
    expect(perTick(-0.1, 7)).toBe(0);
  });
});

describe("weeksToTicks", () => {
  it("multiplies weeks by the week length, at least one tick", () => {
    expect(weeksToTicks(4, 1)).toBe(4);
    expect(weeksToTicks(4, 7)).toBe(28);
    expect(weeksToTicks(0, 7)).toBe(0);
    expect(weeksToTicks(0.01, 7)).toBe(1);
  });
});

describe("weekdayFactor", () => {
  const daily = { ...DEFAULT_CONFIG, ticksPerWeek: 7 };

  it("averages 1 over a week", () => {
    let sum = 0;
    for (let t = 0; t < 7; t++) sum += weekdayFactor(daily, t);
    expect(sum / 7).toBeCloseTo(1, 10);
  });

  it("makes Saturday busier than Monday and repeats weekly", () => {
    expect(weekdayFactor(daily, 5)).toBeGreaterThan(weekdayFactor(daily, 0));
    expect(weekdayFactor(daily, 12)).toBe(weekdayFactor(daily, 5));
  });

  it("is 1 with weekly ticks", () => {
    for (let t = 0; t < 7; t++) expect(weekdayFactor(DEFAULT_CONFIG, t)).toBe(1);
  });
});
