import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { updateVenues } from "@/sim/steps/venues";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { ...DEFAULT_CONFIG, nAgents: 10, healthAlpha: 0.5, closeThreshold: 0.2, closeAfterTicks: 2, graceTicks: 1 };

describe("updateVenues", () => {
  it("moves health toward occupancy (capped at 1)", () => {
    const s = initState(makeTinyWorld(), config, 1);
    s.venueAttendance[0] = 1000;
    updateVenues(s);
    expect(s.venueHealth[0]).toBeCloseTo(0.75);
  });

  it("closes a neglected venue after closeAfterTicks low ticks, but not during grace", () => {
    const s = initState(makeTinyWorld(), config, 1);
    s.venueAttendance.fill(0);
    s.tick = 0;
    updateVenues(s);
    updateVenues(s);
    expect(s.venueOpen[0]).toBe(1);
    s.tick = 5;
    updateVenues(s);
    updateVenues(s);
    expect(s.venueOpen[0]).toBe(0);
  });

  it("resets the low-tick counter when health recovers", () => {
    const s = initState(makeTinyWorld(), config, 1);
    s.tick = 5;
    s.venueHealth[0] = 0.1;
    s.venueAttendance[0] = 0;
    updateVenues(s);
    expect(s.venueLowTicks[0]).toBe(1);
    s.venueAttendance[0] = 1000;
    updateVenues(s);
    expect(s.venueLowTicks[0]).toBe(0);
    expect(s.venueOpen[0]).toBe(1);
  });

  it("reports whether any venue closed", () => {
    const s = initState(makeTinyWorld(), config, 1);
    s.venueAttendance.fill(0);
    s.tick = 5;
    expect(updateVenues(s)).toBe(false);
    expect(updateVenues(s)).toBe(false);
    expect(updateVenues(s)).toBe(true);
  });
});

describe("updateVenues with daily ticks", () => {
  const daily = { ...config, ticksPerWeek: 7 };

  it("judges a venue on its rolling week: full Friday and Saturday is healthy all week", () => {
    const s = initState(makeTinyWorld(), { ...daily, graceTicks: 0 }, 1);
    const capacity = s.venueCapacity[0];
    for (let t = 0; t < 70; t++) {
      s.tick = t;
      s.venueAttendance.fill(0);
      if (t % 7 === 4 || t % 7 === 5) s.venueAttendance[0] = capacity / 2;
      updateVenues(s);
      expect(s.venueLowTicks[0]).toBe(0);
    }
    expect(s.venueWeekVisits[0]).toBe(capacity);
    expect(s.venueOpen[0]).toBe(1);
    expect(s.venueHealth[0]).toBeGreaterThan(0.9);
  });

  it("closes an empty venue after closeAfterTicks weeks of low days past a grace period in weeks", () => {
    const s = initState(makeTinyWorld(), daily, 1);
    s.venueHealth[0] = 0;
    s.venueAttendance.fill(0);
    let closedAt = -1;
    for (let t = 0; t < 60 && closedAt < 0; t++) {
      s.tick = t;
      updateVenues(s);
      if (!s.venueOpen[0]) closedAt = t;
    }
    // Grace: 1 week = ticks 0..6; then 2 weeks = 14 low ticks (7..20).
    expect(closedAt).toBe(20);
  });
});
