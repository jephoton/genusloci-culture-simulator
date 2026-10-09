import { z } from "zod";
import { assembleRings, clipPolygon, clipPolyline, type Pt, type Rect, simplify } from "@/geo/geometry";
import { type LatLon, toLocalMetres } from "@/world/projection";
import type { Geo } from "@/world/schema";

const MAJOR = new Set([
  "motorway", "trunk", "primary", "secondary", "tertiary",
  "motorway_link", "trunk_link", "primary_link", "secondary_link", "tertiary_link",
]);
const MINOR = new Set(["residential", "unclassified", "living_street", "pedestrian"]);
const PARK_LEISURE = new Set(["park", "garden"]);
const PARK_LANDUSE = new Set(["grass", "recreation_ground", "village_green"]);
/** Simplification tolerance in metres. */
const SIMPLIFY_M = { road: 3, area: 6 };

const LatLonSchema = z.object({ lat: z.number(), lon: z.number() });
const OverpassSchema = z.object({
  elements: z.array(
    z.object({
      type: z.string(),
      id: z.number(),
      tags: z.record(z.string(), z.string()).optional(),
      geometry: z.array(LatLonSchema).optional(),
      members: z
        .array(z.object({ type: z.string(), role: z.string(), geometry: z.array(LatLonSchema).optional() }))
        .optional(),
    }),
  ),
});

/** Bounding box (south, west, north, east) of the square of half-side radiusM around centre. */
function bbox(centre: LatLon, radiusM: number): [number, number, number, number] {
  const dLat = radiusM / 110_540;
  const dLon = radiusM / (111_320 * Math.cos((centre.lat * Math.PI) / 180));
  return [centre.lat - dLat, centre.lon - dLon, centre.lat + dLat, centre.lon + dLon];
}

/** Overpass QL for drivable streets, water bodies and parks in the square around `centre`. */
export function buildOverpassQuery(centre: LatLon, radiusM: number): string {
  const b = bbox(centre, radiusM).map((v) => v.toFixed(6)).join(",");
  const highways = [...MAJOR, ...MINOR].join("|");
  return `[out:json][timeout:180];
(
  way["highway"~"^(${highways})$"](${b});
  way["natural"="water"](${b});
  way["waterway"="riverbank"](${b});
  relation["natural"="water"](${b});
  way["leisure"~"^(park|garden)$"](${b});
  relation["leisure"="park"](${b});
  way["landuse"~"^(grass|recreation_ground|village_green)$"](${b});
);
out geom;`;
}

const round = (p: Pt): Pt => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10];

/** Converts an Overpass `out geom` response into the World geo section (local metres, clipped, simplified). */
export function parseOverpass(json: unknown, centre: LatLon, radiusM: number): Geo {
  const { elements } = OverpassSchema.parse(json);
  const rect: Rect = { minX: -radiusM, minY: -radiusM, maxX: radiusM, maxY: radiusM };
  const project = (g: { lat: number; lon: number }[]): Pt[] =>
    g.map((p) => {
      const l = toLocalMetres(p, centre);
      return [l.x, l.y];
    });

  const roads: Geo["roads"] = [];
  const water: Geo["water"] = [];
  const parks: Geo["parks"] = [];
  const addArea = (target: Geo["water"], ring: Pt[]) => {
    const clipped = clipPolygon(simplify(ring, SIMPLIFY_M.area), rect);
    if (clipped) target.push(clipped.map(round));
  };
  const areaTarget = (tags: Record<string, string>) => {
    if (tags.natural === "water" || tags.waterway === "riverbank") return water;
    if (PARK_LEISURE.has(tags.leisure ?? "") || PARK_LANDUSE.has(tags.landuse ?? "")) return parks;
    return null;
  };

  for (const el of elements) {
    const tags = el.tags ?? {};
    if (el.type === "way" && el.geometry && el.geometry.length >= 2) {
      const points = project(el.geometry);
      const highway = tags.highway ?? "";
      const kind = MAJOR.has(highway) ? "major" : MINOR.has(highway) ? "minor" : null;
      if (kind) {
        for (const piece of clipPolyline(simplify(points, SIMPLIFY_M.road), rect)) {
          roads.push({ kind, points: piece.map(round) });
        }
        continue;
      }
      const target = areaTarget(tags);
      const closed = points.length >= 4 && points[0][0] === points[points.length - 1][0] && points[0][1] === points[points.length - 1][1];
      if (target && closed) addArea(target, points);
    } else if (el.type === "relation" && el.members) {
      const target = areaTarget(tags);
      if (!target) continue;
      const outers = el.members
        .filter((m) => m.type === "way" && m.role === "outer" && m.geometry && m.geometry.length >= 2)
        .map((m) => project(m.geometry ?? []));
      for (const ring of assembleRings(outers)) addArea(target, ring);
    }
  }
  return { bounds: { minX: -radiusM, minY: -radiusM, maxX: radiusM, maxY: radiusM }, roads, water, parks };
}
