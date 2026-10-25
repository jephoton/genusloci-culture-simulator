import { describe, expect, it } from "vitest";
import { type RaceContext, RaceContextSchema, raceHelperInstructions } from "@/agents/race-helper";

const context: RaceContext = {
  step: "result",
  artist: "Test Artist",
  venues: [{ letter: "A", name: "Venue One", kind: "club", area: "Soho", qlooFit: 100, regulars: 12 }],
  race: { firstNight: "Fri", nights: 3, nightsPlayed: 3, visits: [30], result: { winner: "A", futures: 3, consistent: true, rows: [{ letter: "A", min: 25, max: 31, wins: 3, hostVisitsWithoutEvent: 6, hostVisitsWithEvent: 36, visitsLostByVenuesNearby: 4 }] } },
};

describe("race helper", () => {
  it("grounds its instructions in the visitor's race and the model's limits", () => {
    const text = raceHelperInstructions("London", context);
    expect(text).toContain("Venue One");
    expect(text).toContain("not ticket sales");
    expect(text).toContain("1.5 km");
  });

  it("rejects contexts with too many venues or unknown steps", () => {
    expect(RaceContextSchema.safeParse(context).success).toBe(true);
    expect(RaceContextSchema.safeParse({ ...context, step: "close_venue" }).success).toBe(false);
    expect(RaceContextSchema.safeParse({ ...context, venues: Array(4).fill(context.venues[0]) }).success).toBe(false);
  });
});
