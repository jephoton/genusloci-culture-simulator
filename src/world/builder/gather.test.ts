import { describe, expect, it } from "vitest";
import type { PlacesQuery, QlooClient, RecommendQuery } from "@/qloo/client";
import type { QEntity, QHeatCell } from "@/qloo/schemas";
import { QlooError } from "@/qloo/transport";
import { gatherCity, gatherHeatmaps } from "@/world/builder/gather";
import { KIND_QUERIES } from "@/world/builder/kinds";
import type { Geo, World } from "@/world/schema";

const CITY = { slug: "t", name: "T", lat: 51.5, lon: -0.1, radiusM: 1000 };
const geo: Geo = { bounds: { minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 }, roads: [], water: [], parks: [] };
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const place = (n: number, popularity: number): QEntity => ({ id: uuid(n), name: `p${n}`, popularity, tags: [], location: { lat: 51.5, lon: -0.1 } });
const invalid = () => new QlooError("Qloo 400: All of the provided signal.interests.entities were invalid.", 400);

/** A fake client: two places per kind query; venue 0 has no artist data. */
function fakeClient() {
  const placeCalls: PlacesQuery[] = [];
  const recCalls: string[] = [];
  const heatCalls: string[] = [];
  let n = 0;
  const q = {
    async places(query: PlacesQuery) {
      placeCalls.push(query);
      return [place(n++, 0.9), place(n++, 0.5)];
    },
    async recommend(_type: string, query: RecommendQuery) {
      const id = query.signalEntities![0];
      recCalls.push(id);
      if (id === uuid(0)) throw invalid();
      return [{ id: uuid(9000), name: "a", tags: [] }];
    },
    async heatmap(query: { signalEntities?: readonly string[]; signalTags?: readonly string[] }) {
      const id = (query.signalEntities ?? query.signalTags)![0];
      heatCalls.push(id);
      if (id === "bad") throw invalid();
      if (id === "empty") return [];
      return [{ lat: 0, lon: 0, geohash: "x", affinity: 1, affinityRank: 1, popularity: 1 } satisfies QHeatCell];
    },
  } as unknown as QlooClient;
  return { q, placeCalls, recCalls, heatCalls };
}

describe("gatherCity", () => {
  it("runs one place query per kind over a circle covering the square bounds", async () => {
    const f = fakeClient();
    const b = await gatherCity(f.q, CITY, geo, { anchors: 3 });
    expect(f.placeCalls).toHaveLength(KIND_QUERIES.length);
    expect(f.placeCalls[0].radiusM).toBe(1414);
    expect(f.placeCalls.map((p) => p.tags)).toEqual(KIND_QUERIES.map((k) => k.tags));
    expect(b.venues).toHaveLength(KIND_QUERIES.length * 2);
  });

  it("skips venues without artist data and stops after enough anchors", async () => {
    const f = fakeClient();
    const progress: string[] = [];
    const b = await gatherCity(f.q, CITY, geo, { anchors: 3, onProgress: (m) => progress.push(m) });
    expect(Object.keys(b.artistsByVenue)).toHaveLength(3);
    expect(b.artistsByVenue[uuid(0)]).toBeUndefined();
    expect(f.recCalls[0]).toBe(uuid(0)); // the club query's most popular venue is tried first
    expect(progress.at(-1)).toMatch(/3 anchor venues of 4 tried/);
  });
});

describe("gatherHeatmaps", () => {
  it("falls back through candidates and never reuses an entity across roles or scenes", async () => {
    const f = fakeClient();
    const world = { entities: ["bad", "empty", "good", "other", "third"].map((id) => ({ id, name: id })) } as unknown as World;
    const out = await gatherHeatmaps(f.q, world, [
      { archetype: 0, seed: [0, 1, 2], check: [2, 3] },
      { archetype: 1, seed: [3, 4], check: [2] },
    ], CITY, undefined, 1);
    expect(out.seeds.map((r) => [r.archetype, r.entity])).toEqual([[0, 2], [1, 4]]);
    expect(out.checks.map((r) => [r.archetype, r.entity])).toEqual([[0, 3]]);
    expect(f.heatCalls).toEqual(["bad", "empty", "good", "other", "third"]);
  });
});
