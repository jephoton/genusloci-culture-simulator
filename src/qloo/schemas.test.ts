import { describe, expect, it } from "vitest";
import { parseAudiences, parseDemographics, parseEntityList, parseHeatmap, parseInsightEntities, parseTags } from "@/qloo/schemas";
import { checkAudiences, checkEntityIds, checkLocation, checkTags, checkTake, wktPoint } from "@/qloo/validate";

// Synthetic payloads shaped like Qloo responses (no real Qloo data in the repo).
const ID = "00000000-0000-4000-8000-000000000001";

const rawPlace = {
  entity_id: ID,
  name: "The Test Rooms",
  type: "urn:entity",
  subtype: "urn:entity:place",
  popularity: 0.9,
  location: { lat: 51.5, lon: -0.1, geohash: "gcpvj0e0000" },
  query: { affinity: 0.8, distance: 120, measurements: {} },
  tags: [
    { id: "urn:tag:genre:place:night_club", name: "Night Club", type: "urn:tag:genre:place", weight: null },
    { tag_id: "urn:tag:decor:qloo:industrial", name: " Industrial", type: "urn:tag:decor:qloo" },
  ],
  properties: {
    address: "1 Test St",
    business_rating: 4.2,
    price_level: 2,
    live_music: true,
    keywords: [{ name: "djs", count: 9 }],
    akas: [{ value: "verbose" }],
    hours: { monday: [] },
    images: [{ url: "x" }],
  },
};

describe("parseInsightEntities", () => {
  it("keeps the fields we use and drops verbose properties", () => {
    const [e] = parseInsightEntities({ success: true, results: { entities: [rawPlace] } });
    expect(e).toEqual({
      id: ID,
      name: "The Test Rooms",
      type: "urn:entity:place",
      popularity: 0.9,
      affinity: 0.8,
      distance: 120,
      location: { lat: 51.5, lon: -0.1, geohash: "gcpvj0e0000" },
      tags: [
        { id: "urn:tag:genre:place:night_club", name: "Night Club", type: "urn:tag:genre:place" },
        { id: "urn:tag:decor:qloo:industrial", name: "Industrial", type: "urn:tag:decor:qloo" },
      ],
      place: { address: "1 Test St", rating: 4.2, priceLevel: 2, liveMusic: true, keywords: [{ name: "djs", count: 9 }] },
    });
    expect(JSON.stringify(e)).not.toContain("verbose");
  });

  it("rejects a payload without results.entities", () => {
    expect(() => parseInsightEntities({ success: true, results: {} })).toThrow();
  });
});

describe("other parsers", () => {
  it("reads search/entities results (types[] instead of subtype)", () => {
    const { subtype: _s, ...rest } = rawPlace;
    const [e] = parseEntityList({ results: [{ ...rest, types: ["urn:entity:place"] }] });
    expect(e.type).toBe("urn:entity:place");
    expect(e.place?.address).toBe("1 Test St");
  });

  it("reads tags from tag search and taste analysis", () => {
    const tags = parseTags({
      results: {
        tags: [
          { id: "urn:tag:genre:music:techno", name: "Techno", type: "urn:tag:genre:music", popularity: 0.99 },
          { tag_id: "urn:tag:inclusivity:place:x", name: "X", subtype: "urn:tag:inclusivity:place", query: { affinity: 1 } },
          { id: "urn:tag:genre:place:night_club" },
        ],
      },
    });
    expect(tags).toEqual([
      { id: "urn:tag:genre:music:techno", name: "Techno", type: "urn:tag:genre:music", popularity: 0.99 },
      { id: "urn:tag:inclusivity:place:x", name: "X", type: "urn:tag:inclusivity:place", affinity: 1 },
      { id: "urn:tag:genre:place:night_club", name: "night club" },
    ]);
  });

  it("reads heatmap cells", () => {
    const cells = parseHeatmap({
      results: {
        heatmap: [{ location: { latitude: 1, longitude: 2, geohash: "abc" }, query: { affinity: 0.5, affinity_rank: 0.4, popularity: 0.3 } }],
      },
    });
    expect(cells).toEqual([{ lat: 1, lon: 2, geohash: "abc", affinity: 0.5, affinityRank: 0.4, popularity: 0.3 }]);
  });

  it("reads audiences and demographics", () => {
    expect(parseAudiences({ results: { audiences: [{ id: "urn:audience:communities:x", name: "X", type: "urn:audience:communities" }] } })).toEqual([
      { id: "urn:audience:communities:x", name: "X", type: "urn:audience:communities" },
    ]);
    expect(parseDemographics({ results: { demographics: [{ entity_id: ID, query: { age: { "25_to_29": 0.2 }, gender: { male: 0.1 } } }] } })).toEqual([
      { id: ID, age: { "25_to_29": 0.2 }, gender: { male: 0.1 } },
    ]);
  });
});

describe("validation", () => {
  it("accepts well-formed values", () => {
    expect(() => checkEntityIds([ID])).not.toThrow();
    expect(() => checkTags(["urn:tag:genre:place:restaurant:bar"])).not.toThrow();
    expect(() => checkAudiences(["urn:audience:communities:lgbtq"])).not.toThrow();
    expect(() => checkTake(50)).not.toThrow();
    expect(() => checkLocation({ lat: 1.29, lon: 103.85 }, 1500)).not.toThrow();
  });

  it("rejects values Qloo would silently ignore", () => {
    expect(() => checkEntityIds(["fabric London"])).toThrow(/UUID/);
    expect(() => checkTags(["techno"])).toThrow(/tag URN/);
    expect(() => checkAudiences(["lgbtq"])).toThrow(/audience URN/);
    expect(() => checkTake(51)).toThrow(/1–50/);
    expect(() => checkLocation({ lat: 103.85, lon: 1.29 }, 1500)).toThrow(/out of range/);
    expect(() => checkLocation({ lat: 1, lon: 1 }, 0)).toThrow(/radius/);
  });

  it("writes WKT with longitude first", () => {
    expect(wktPoint({ lat: 51.5, lon: -0.12 })).toBe("POINT(-0.12 51.5)");
  });
});
