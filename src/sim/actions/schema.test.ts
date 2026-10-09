import { describe, expect, it } from "vitest";
import { parseAction } from "@/sim/actions/schema";

describe("parseAction", () => {
  it("accepts every action type", () => {
    const valid = [
      { type: "closeVenue", venue: 3 },
      { type: "openVenue", entity: 5, cell: 2 },
      { type: "openVenue", entity: 5, cell: 2, capacity: 80 },
      { type: "scheduleEvent", entity: 7, cell: 1, duration: 2, reachKm: 10, capacity: 5000 },
      { type: "migrate", count: 100, cells: [0, 1], genes: [{ entity: 4, weight: 0.8 }] },
      { type: "rentPressure", cells: [3], magnitude: 0.5 },
    ];
    for (const a of valid) expect(parseAction(a)).toEqual(a);
  });

  it("rejects malformed actions", () => {
    const invalid = [
      { type: "explode" },
      { type: "closeVenue", venue: -1 },
      { type: "closeVenue", venue: 1.5 },
      { type: "scheduleEvent", entity: 7, cell: 1, duration: 0, reachKm: 10, capacity: 5000 },
      { type: "migrate", count: 10, cells: [0], genes: [] },
      { type: "migrate", count: 10, cells: [], genes: [{ entity: 1, weight: 1 }] },
      { type: "rentPressure", cells: [3], magnitude: 0 },
    ];
    for (const a of invalid) expect(() => parseAction(a), JSON.stringify(a)).toThrow();
  });
});
