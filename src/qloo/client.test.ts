import { describe, expect, it, vi } from "vitest";
import { createQlooClient, distanceM } from "@/qloo/client";
import { QlooError, type Params, type Transport } from "@/qloo/transport";

const ID = "00000000-0000-4000-8000-000000000001";
const AT = { lat: 51.5, lon: -0.12 };

/** A fake transport that records requests and replies with canned JSON. */
function fakeTransport(reply: (path: string, params: Params) => unknown) {
  const calls: { path: string; params: Params }[] = [];
  const t: Transport = {
    async get(path, params, parse) {
      calls.push({ path, params });
      return parse(reply(path, params));
    },
    stats: () => ({ calls: calls.length, cacheHits: 0, rateLimited: 0 }),
  };
  return { t, calls };
}

const entity = (name: string) => ({ entity_id: ID, name, subtype: "urn:entity:place", location: { lat: 51.5, lon: -0.12 } });

describe("createQlooClient", () => {
  it("builds a places request: WKT lon-first point, rounded radius, tags, take and offset", async () => {
    const { t, calls } = fakeTransport(() => ({ results: { entities: [entity("A")] } }));
    const q = createQlooClient(t);
    const out = await q.places({ at: AT, radiusM: 1500.4, tags: ["urn:tag:genre:place:night_club"], take: 20, offset: 40 });
    expect(out.map((e) => e.name)).toEqual(["A"]);
    expect(calls[0]).toEqual({
      path: "/v2/insights",
      params: {
        "filter.type": "urn:entity:place",
        "filter.location": "POINT(-0.12 51.5)",
        "filter.location.radius": 1500,
        "filter.tags": ["urn:tag:genre:place:night_club"],
        "signal.interests.entities": undefined,
        "signal.interests.tags": undefined,
        "signal.demographics.audiences": undefined,
        take: 20,
        offset: 40,
      },
    });
  });

  it("rejects invalid input before spending a call", async () => {
    const { t, calls } = fakeTransport(() => ({}));
    const q = createQlooClient(t);
    await expect(q.places({ at: AT, radiusM: 1500, tags: ["night_club"] })).rejects.toThrow(QlooError);
    await expect(q.places({ at: AT, radiusM: 1500, take: 100 })).rejects.toThrow(/1–50/);
    await expect(q.recommend("urn:entity:artist", {})).rejects.toThrow(/signal or a location/);
    await expect(q.recommend("urn:entity:music" as never, { signalEntities: [ID] })).rejects.toThrow(/unsupported entity type/);
    await expect(q.heatmap({ at: AT, radiusM: 1500 })).rejects.toThrow(/needs a signal/);
    await expect(q.searchTags({})).rejects.toThrow(/query or tag types/);
    expect(calls).toHaveLength(0);
  });

  it("flags empty results only when the request carried a filter or signal", async () => {
    const { t } = fakeTransport(() => ({ results: { entities: [] } }));
    const onSuspectEmpty = vi.fn();
    const q = createQlooClient(t, { onSuspectEmpty });
    await q.places({ at: AT, radiusM: 1500 });
    expect(onSuspectEmpty).not.toHaveBeenCalled();
    await q.places({ at: AT, radiusM: 1500, tags: ["urn:tag:genre:place:bar"] });
    expect(onSuspectEmpty).toHaveBeenCalledTimes(1);
  });

  it("recommends with a location signal and entity signals", async () => {
    const { t, calls } = fakeTransport(() => ({ results: { entities: [] } }));
    const q = createQlooClient(t, { onSuspectEmpty: () => {} });
    await q.recommend("urn:entity:artist", { signalEntities: [ID], near: { at: AT, radiusM: 1500 }, take: 10 });
    expect(calls[0].params).toMatchObject({
      "filter.type": "urn:entity:artist",
      "signal.interests.entities": [ID],
      "signal.location": "POINT(-0.12 51.5)",
      "signal.location.radius": 1500,
      take: 10,
    });
  });

  it("clips heatmap cells to the requested radius", async () => {
    const near = { location: { latitude: 51.501, longitude: -0.12, geohash: "a" }, query: { affinity: 1 } };
    const far = { location: { latitude: 51.6, longitude: -0.12, geohash: "b" }, query: { affinity: 0.5 } };
    const { t } = fakeTransport(() => ({ results: { heatmap: [near, far] } }));
    const q = createQlooClient(t);
    const cells = await q.heatmap({ at: AT, radiusM: 1500, signalTags: ["urn:tag:genre:place:night_club"] });
    expect(cells.map((c) => c.geohash)).toEqual(["a"]);
  });

  it("uses the right paths for tags, audiences and demographics", async () => {
    const { t, calls } = fakeTransport((path) =>
      path === "/v2/tags" || path === "/v2/insights"
        ? { results: { tags: [{ id: "urn:tag:genre:music:techno", name: "Techno" }], demographics: [] } }
        : { results: { audiences: [{ id: "urn:audience:communities:x", name: "X" }], audience_types: [{ type: "urn:audience:communities" }] } },
    );
    const q = createQlooClient(t, { onSuspectEmpty: () => {} });
    await q.searchTags({ query: "techno" });
    await q.tagAffinities({ signalEntities: [ID] });
    await q.audienceTypes();
    await q.audiences({ types: ["urn:audience:communities"] });
    await q.demographics([ID]);
    expect(calls.map((c) => [c.path, c.params["filter.type"] ?? c.params["filter.query"] ?? c.params["filter.audience.types"] ?? null])).toEqual([
      ["/v2/tags", "techno"],
      ["/v2/insights", "urn:tag"],
      ["/v2/audiences/types", null],
      ["/v2/audiences", ["urn:audience:communities"]],
      ["/v2/insights", "urn:demographics"],
    ]);
  });
});

describe("distanceM", () => {
  it("measures about 111 km per degree of latitude", () => {
    expect(distanceM({ lat: 0, lon: 0 }, { lat: 1, lon: 0 })).toBeCloseTo(111_195, -2);
  });
});
