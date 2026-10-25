import { describe, expect, it } from "vitest";
import type { EventOutcome } from "@/sim/events";
import { raceStartTick, summariseRace } from "@/ui/venue-race";

const o = (turnout: number, extra: Partial<EventOutcome> = {}): EventOutcome => ({ turnout, newFans: 0, scenes: [], neighbourLoss: 0, hostChange: 0, hostBaseline: 10, hostWithEvent: 10 + turnout, ...extra });

describe("raceStartTick", () => {
  it("picks the next matching weekday after the current tick", () => {
    expect(raceStartTick(14, 4)).toBe(18); // tick 14 is a Monday; Friday is 18
    expect(raceStartTick(17, 4)).toBe(18);
    expect(raceStartTick(18, 4)).toBe(25); // never the current tick itself
  });
});

describe("summariseRace", () => {
  it("reports the watched winner, ranges and wins across futures", () => {
    const s = summariseRace([[o(30), o(50)], [o(50), o(45)], [o(20), o(60)]]);
    expect(s.winner).toBe(1);
    expect(s.consistent).toBe(false);
    expect(s.rows[1]).toMatchObject({ watched: 50, min: 45, max: 60, wins: 2, usual: 10, withEvent: 60 });
    expect(s.rows[0]).toMatchObject({ min: 20, max: 50, wins: 1 });
  });

  it("calls ties instead of inventing a winner", () => {
    const s = summariseRace([[o(30), o(30)], [o(30), o(31)]]);
    expect(s.winner).toBeNull();
    expect(s.consistent).toBe(false);
    expect(s.rows.map((r) => r.wins)).toEqual([0, 1]);
  });

  it("marks a winner that leads in every future as consistent", () => {
    expect(summariseRace([[o(9), o(1)], [o(8), o(2)]]).consistent).toBe(true);
  });
});
