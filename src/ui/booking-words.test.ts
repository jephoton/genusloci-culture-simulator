import { describe, expect, it } from "vitest";
import { bookingVerdict, suggestActs } from "@/ui/booking-words";

const e = (type: "artist" | "tag" | "place") => ({ id: Math.random().toString(), name: type, type, tags: [], popularity: 0.5 });
// 0 venue, 1–3 artists, 4 tag
const world = {
  entities: [e("place"), e("artist"), e("artist"), e("artist"), e("tag")],
  edges: [
    { source: 0, target: 2, weight: 0.9 }, // recommended for the venue's crowd
    { source: 0, target: 4, weight: 0.8 }, // the venue's tag
    { source: 4, target: 3, weight: 0.6 }, // artist sharing that tag
    { source: 4, target: 2, weight: 0.6 },
  ],
};

describe("suggestActs", () => {
  it("puts recommended artists first, then artists sharing the venue's taste, without repeats", () => {
    expect(suggestActs(world, 0)).toEqual([2, 3]);
    expect(suggestActs(world, 0, 1)).toEqual([2]);
  });
});

describe("bookingVerdict", () => {
  it("leads with the owner's own venue", () => {
    expect(bookingVerdict([{ label: "A", turnout: 120, hostChange: 15, neighbourLoss: 4 }], "Heaven")).toBe("A is the best bet: 120 visits and brings Heaven 15 extra visits.");
    expect(bookingVerdict([{ label: "A", turnout: 120, hostChange: -8, neighbourLoss: 4 }, { label: "B", turnout: 115, hostChange: 2, neighbourLoss: 0 }], "Heaven")).toBe(
      "A is the best bet: 120 visits but takes 8 visits from Heaven's usual nights; B is close behind.",
    );
    expect(bookingVerdict([{ label: "A", turnout: 0, hostChange: 0, neighbourLoss: 0 }], "Heaven")).toMatch(/None/);
  });
});
