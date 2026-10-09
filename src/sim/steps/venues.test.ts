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
});
