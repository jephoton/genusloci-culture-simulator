import { describe, expect, it } from "vitest";
import type { QEntity } from "@/qloo/schemas";
import { assembleWorld, attachHeatmaps, type CityBundle, sphericalKMeans } from "@/world/builder/assemble";
import { fromLocalMetres } from "@/world/projection";
import { parseWorld, type Geo } from "@/world/schema";

// Synthetic bundle (no Qloo data): two taste neighbourhoods, techno clubs in the west and jazz bars
// in the east, with their own artists.
const CITY = { slug: "testopolis", name: "Testopolis", lat: 51.5, lon: -0.1, radiusM: 1500 };
const roads: Geo["roads"] = [];
for (let v = -1500; v <= 1500; v += 150) {
  roads.push({ kind: "minor", points: [[v, -1500], [v, 1500]] });
  roads.push({ kind: "minor", points: [[-1500, v], [1500, v]] });
}
const geo: Geo = { bounds: { minX: -1500, minY: -1500, maxX: 1500, maxY: 1500 }, roads, water: [], parks: [] };

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const tag = (id: string, type: string) => ({ id: `${type}:${id}`, name: id.replace(/_/g, " "), type });
const shared = [tag("lively", "urn:tag:ambience:qloo"), tag("credit_cards", "urn:tag:payments:place")];

function venue(n: number, x: number, y: number, style: "techno" | "jazz", popularity: number): QEntity {
  const genre = style === "techno" ? "urn:tag:genre:place:night_club" : "urn:tag:genre:place:jazz_club";
  return {
    id: uuid(n),
    name: `${style} venue ${n}`,
    type: "urn:entity:place",
    popularity,
    location: fromLocalMetres({ x, y }, CITY),
    tags: [
      { id: genre, name: style, type: "urn:tag:genre:place" },
      ...shared,
      ...(style === "techno"
        ? [tag("dark", "urn:tag:ambience:qloo"), tag("ravers", "urn:tag:customer_identity:qloo"), tag("late_night", "urn:tag:time_of_day_fit:qloo")]
        : [tag("intimate", "urn:tag:ambience:qloo"), tag("couples", "urn:tag:customer_identity:qloo"), tag("evening", "urn:tag:time_of_day_fit:qloo")]),
    ],
  };
}
function artist(n: number, style: "techno" | "jazz"): QEntity {
  return {
    id: uuid(1000 + n),
    name: `${style} artist ${n}`,
    type: "urn:entity:artist",
    popularity: 0.5,
    tags: [{ id: `urn:tag:genre:music:${style}`, name: style, type: "urn:tag:genre:music" }],
  };
}

const venues: CityBundle["venues"] = [];
const artistsByVenue: CityBundle["artistsByVenue"] = {};
for (let i = 0; i < 12; i++) {
  const techno = venue(i, -900 + (i % 4) * 120, -300 + Math.floor(i / 4) * 200, "techno", 0.9 - i * 0.01);
  const jazz = venue(100 + i, 700 + (i % 4) * 120, 200 + Math.floor(i / 4) * 200, "jazz", 0.8 - i * 0.01);
  venues.push({ entity: techno, queryKind: "club" }, { entity: jazz, queryKind: "music_venue" });
  artistsByVenue[techno.id] = [0, 1, 2, 3].map((k) => artist((i + k) % 6, "techno"));
  artistsByVenue[jazz.id] = [0, 1, 2, 3].map((k) => artist(10 + ((i + k) % 6), "jazz"));
}
// A duplicate from a second kind query, an out-of-bounds venue and a closed one: all dropped.
venues.push({ entity: venues[0].entity, queryKind: "bar" });
venues.push({ entity: { ...venue(500, 5000, 0, "jazz", 1), name: "far away" }, queryKind: "bar" });
venues.push({ entity: { ...venue(501, 0, 0, "jazz", 1), name: "closed", place: { isClosed: true } }, queryKind: "bar" });

const bundle: CityBundle = { city: CITY, geo, venues, artistsByVenue, builtAt: "2026-10-14T00:00:00Z" };

describe("assembleWorld", () => {
  const { world, heatmapPlan } = assembleWorld(bundle, { archetypes: 2, maxPerCell: 4, capacityTotal: 1000 });
  const placesOf = world.entities.filter((e) => e.type === "place");

  it("produces a schema-valid, deterministic world with Qloo attribution", () => {
    expect(() => parseWorld(world)).not.toThrow();
    expect(world.meta).toEqual({ source: "qloo", builtAt: "2026-10-14T00:00:00Z", attribution: "Taste data: Qloo" });
    expect(assembleWorld(bundle, { archetypes: 2, maxPerCell: 4, capacityTotal: 1000 }).world).toEqual(world);
  });

  it("drops duplicates, out-of-bounds and closed venues, and caps venues per cell", () => {
    const names = placesOf.map((e) => e.name);
    expect(names).toHaveLength(24);
    expect(names).not.toContain("far away");
    expect(names).not.toContain("closed");
    const perCell = new Map<number, number>();
    for (const e of placesOf) if (e.cell !== undefined) perCell.set(e.cell, (perCell.get(e.cell) ?? 0) + 1);
    expect(Math.max(...perCell.values())).toBeLessThanOrEqual(4);
    expect(placesOf.some((e) => e.cell === undefined)).toBe(placesOf.filter((e) => e.cell !== undefined).length < 24);
  });

  it("assigns kinds from the venues' own genre tags", () => {
    expect(placesOf.find((e) => e.name.startsWith("techno"))?.kind).toBe("club");
    expect(placesOf.find((e) => e.name.startsWith("jazz"))?.kind).toBe("music_venue");
  });

  it("keeps taste tags shared by several venues and drops non-taste or universal ones", () => {
    const tagNames = world.entities.filter((e) => e.type === "tag").map((e) => e.name);
    expect(tagNames).toEqual(expect.arrayContaining(["dark", "intimate", "ravers", "couples"]));
    expect(tagNames).not.toContain("credit cards"); // payments: not a taste type
    expect(tagNames).not.toContain("lively"); // on every venue (> 70%)
    expect(tagNames).toEqual(expect.arrayContaining(["techno", "jazz"])); // music tags from artists
  });

  it("builds symmetric edges in (0, 1] with no self-loops", () => {
    const key = new Map(world.edges.map((e) => [`${e.source},${e.target}`, e.weight]));
    for (const e of world.edges) {
      expect(e.weight).toBeGreaterThan(0);
      expect(e.weight).toBeLessThanOrEqual(1);
      expect(e.source).not.toBe(e.target);
      expect(key.get(`${e.target},${e.source}`)).toBe(e.weight);
    }
  });

  it("finds the two scenes, names them by distinctive tags and gives them their artists", () => {
    expect(world.archetypes).toHaveLength(2);
    const genesOf = (a: (typeof world.archetypes)[number]) => a.genes.map((g) => world.entities[g.entity].name);
    const techno = world.archetypes.find((a) => genesOf(a).includes("dark"))!;
    const jazz = world.archetypes.find((a) => genesOf(a).includes("intimate"))!;
    expect(techno).toBeDefined();
    expect(jazz).toBeDefined();
    expect(genesOf(techno).some((n) => n.startsWith("techno artist"))).toBe(true);
    expect(genesOf(techno).some((n) => n.startsWith("jazz artist"))).toBe(false);
    expect(techno.name).not.toBe(jazz.name);
    for (const a of world.archetypes) for (const g of a.genes) expect(g.weight).toBeGreaterThan(0);
  });

  it("seeds each cell's mix from nearby venues: techno in the west, jazz in the east", () => {
    const technoA = world.archetypes.findIndex((a) => a.genes.some((g) => world.entities[g.entity].name === "dark"));
    for (const c of world.cells) expect(c.archetypes.reduce((s, a) => s + a.weight, 0)).toBeCloseTo(1, 6);
    const west = world.cells.reduce((p, c) => (c.lon < p.lon ? c : p));
    const east = world.cells.reduce((p, c) => (c.lon > p.lon ? c : p));
    expect(west.archetypes[technoA].weight).toBeGreaterThan(east.archetypes[technoA].weight);
  });

  it("normalises the capacity of placed venues to the total", () => {
    const total = placesOf.filter((e) => e.cell !== undefined).reduce((s, e) => s + (e.capacity ?? 0), 0);
    expect(total).toBeGreaterThan(990);
    expect(total).toBeLessThan(1010);
  });

  it("plans a heatmap per archetype, artist candidates first", () => {
    expect(heatmapPlan).toHaveLength(2);
    for (const p of heatmapPlan) {
      expect(world.entities[p.candidates[0]].type).toBe("artist");
      expect(world.entities[p.candidates.at(-1)!].type).toBe("place");
    }
  });
});

describe("attachHeatmaps", () => {
  it("averages Qloo cells into the nearest world cell and drops empty results", () => {
    const { world } = assembleWorld(bundle, { archetypes: 2 });
    const c0 = world.cells[0];
    const out = attachHeatmaps(world, [
      { entity: 0, cells: [{ lat: c0.lat, lon: c0.lon, geohash: "a", affinity: 0.8, affinityRank: 0, popularity: 0 }, { lat: c0.lat, lon: c0.lon, geohash: "b", affinity: 0.4, affinityRank: 0, popularity: 0 }] },
      { entity: 1, cells: [] },
    ]);
    expect(out.heatmaps).toHaveLength(1);
    expect(out.heatmaps[0].values[0]).toBeCloseTo(0.6, 6);
    expect(out.heatmaps[0].values).toHaveLength(world.cells.length);
    expect(() => parseWorld(out)).not.toThrow();
  });
});

describe("sphericalKMeans", () => {
  it("separates orthogonal groups deterministically", () => {
    const v = (a: number, b: number) => new Map([[a, 1], [b, 0.2]]);
    const vectors = [v(0, 1), v(0, 2), v(0, 1), v(5, 6), v(5, 7), v(5, 6)];
    const a = sphericalKMeans(vectors, 2, 3);
    expect(a.slice(0, 3).every((x) => x === a[0])).toBe(true);
    expect(a.slice(3).every((x) => x === a[3])).toBe(true);
    expect(a[0]).not.toBe(a[3]);
    expect(sphericalKMeans(vectors, 2, 3)).toEqual(a);
  });
});
