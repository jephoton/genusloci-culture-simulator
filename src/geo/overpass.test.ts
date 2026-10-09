import { describe, expect, it } from "vitest";
import { CITIES } from "@/geo/cities";
import { buildOverpassQuery, parseOverpass } from "@/geo/overpass";
import { fromLocalMetres, toLocalMetres } from "@/world/projection";

const centre = { lat: 51.5, lon: -0.1 };
const radiusM = 1000;
// Synthetic Overpass-shaped response (not real OSM data).
const at = (x: number, y: number) => {
  const p = fromLocalMetres({ x, y }, centre);
  return { lat: p.lat, lon: p.lon };
};
const response = {
  elements: [
    { type: "way", id: 1, tags: { highway: "primary" }, geometry: [at(-2000, 0), at(0, 0), at(500, 0)] },
    { type: "way", id: 2, tags: { highway: "residential" }, geometry: [at(0, -300), at(0, 300)] },
    { type: "way", id: 3, tags: { highway: "footway" }, geometry: [at(100, 100), at(200, 200)] },
    { type: "way", id: 4, tags: { leisure: "park" }, geometry: [at(100, 100), at(300, 100), at(300, 300), at(100, 300), at(100, 100)] },
    {
      type: "relation",
      id: 5,
      tags: { natural: "water", type: "multipolygon" },
      members: [
        { type: "way", role: "outer", geometry: [at(-500, -500), at(500, -500)] },
        { type: "way", role: "outer", geometry: [at(500, -400), at(500, -500)] },
        { type: "way", role: "outer", geometry: [at(500, -400), at(-500, -400), at(-500, -500)] },
        { type: "way", role: "inner", geometry: [at(0, -450), at(10, -450), at(10, -440), at(0, -450)] },
      ],
    },
  ],
};

describe("projection round trip", () => {
  it("fromLocalMetres inverts toLocalMetres", () => {
    const p = toLocalMetres(fromLocalMetres({ x: 123, y: -456 }, centre), centre);
    expect(p.x).toBeCloseTo(123, 6);
    expect(p.y).toBeCloseTo(-456, 6);
  });
});

describe("buildOverpassQuery", () => {
  it("asks for roads, water and parks in the bbox as JSON with geometry", () => {
    const q = buildOverpassQuery(centre, radiusM);
    expect(q).toContain("[out:json]");
    expect(q).toContain("out geom");
    expect(q).toMatch(/highway/);
    expect(q).toMatch(/natural"="water/);
    expect(q).toMatch(/leisure/);
  });
});

describe("parseOverpass", () => {
  const geo = parseOverpass(response, centre, radiusM);

  it("bounds the square around the centre", () => {
    expect(geo.bounds).toEqual({ minX: -1000, minY: -1000, maxX: 1000, maxY: 1000 });
  });

  it("classifies and clips roads, ignoring footways", () => {
    expect(geo.roads.map((r) => r.kind).sort()).toEqual(["major", "minor"]);
    const major = geo.roads.find((r) => r.kind === "major");
    expect(major?.points[0][0]).toBeCloseTo(-1000, 0);
    for (const r of geo.roads) for (const [x, y] of r.points) {
      expect(Math.abs(x)).toBeLessThanOrEqual(1000.01);
      expect(Math.abs(y)).toBeLessThanOrEqual(1000.01);
    }
  });

  it("assembles multipolygon water and keeps closed-way parks", () => {
    expect(geo.water).toHaveLength(1);
    expect(geo.parks).toHaveLength(1);
    expect(geo.water[0].length).toBeGreaterThanOrEqual(3);
  });

  it("rejects a malformed response", () => {
    expect(() => parseOverpass({ nope: true }, centre, radiusM)).toThrow();
  });

  it("knows London", () => {
    expect(CITIES.london.name).toBe("London");
  });
});
