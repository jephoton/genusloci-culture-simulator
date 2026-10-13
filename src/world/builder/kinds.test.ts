import { describe, expect, it } from "vitest";
import { KIND_CAPACITY, KIND_QUERIES, kindOf } from "@/world/builder/kinds";
import { VENUE_KINDS } from "@/world/schema";

describe("kinds", () => {
  it("has one query per venue kind, all with genre tag URNs", () => {
    expect(KIND_QUERIES.map((q) => q.kind).sort()).toEqual([...VENUE_KINDS].sort());
    for (const q of KIND_QUERIES) for (const t of q.tags) expect(t).toMatch(/^urn:tag:genre:place:[a-z_:]+$/);
    for (const k of VENUE_KINDS) expect(KIND_CAPACITY[k]).toBeGreaterThan(0);
  });

  it("picks the most specific kind from a venue's own tags", () => {
    const tags = ["urn:tag:genre:place:restaurant", "urn:tag:genre:place:restaurant:cocktail_bar", "urn:tag:ambience:qloo:lively"];
    expect(kindOf(tags, "restaurant")).toBe("bar");
    expect(kindOf([...tags, "urn:tag:category:place:night_club"], "bar")).toBe("club");
    expect(kindOf(["urn:tag:genre:place:live_music_venue", "urn:tag:genre:place:restaurant:pub"], "bar")).toBe("music_venue");
  });

  it("ignores non-genre tags and falls back to the query's kind", () => {
    expect(kindOf(["urn:tag:amenity:qloo:bar"], "gallery")).toBe("gallery");
    expect(kindOf([], "other")).toBe("other");
  });
});
