import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PerspectiveCamera, Vector3 } from "three";
import { CITIES } from "@/geo/cities";
import { makeStreetLabelCandidates, selectStreetLabels, snapStreetLabels } from "@/render/street-labels";
import type { CityLayout, XZ } from "@/render/layout";
import { GeoSchema } from "@/world/schema";

const sceneRoads = (roads: ReturnType<typeof GeoSchema.parse>["roads"]): CityLayout["roads"] =>
  roads.map((road) => ({ ...road, points: road.points.map(([x, y]): XZ => [x / 10, -y / 10]) }));

describe("bundled OSM street name supplements", () => {
  for (const city of Object.values(CITIES)) {
    it(`provides real named streets aligned to the existing ${city.name} map`, () => {
      const supplement = JSON.parse(readFileSync(`public/geo/${city.slug}-street-names.json`, "utf8"));
      const existing = JSON.parse(readFileSync(`public/geo/${city.slug}.json`, "utf8"));
      expect(supplement.city).toEqual({ slug: city.slug, lat: city.lat, lon: city.lon });
      expect(supplement.attribution).toContain("OpenStreetMap contributors");
      const roads = GeoSchema.shape.roads.parse(supplement.roads);
      expect(roads.every((road) => road.name?.trim())).toBe(true);
      const candidates = makeStreetLabelCandidates(sceneRoads(roads));
      const snapped = snapStreetLabels(candidates, sceneRoads(GeoSchema.parse(existing.geo).roads));
      expect(new Set(snapped.map((label) => label.name)).size).toBeGreaterThan(20);
      const camera = new PerspectiveCamera(42, 1400 / 900, 0.5, 2400);
      camera.position.set(0, 48, 60);
      camera.lookAt(0, 0, 0);
      camera.updateMatrixWorld();
      const projected = snapped.flatMap((label) => {
        const point = new Vector3(label.x, 0.2, label.z).project(camera);
        const end = new Vector3(label.x + label.dx / 2, 0.2, label.z + label.dz / 2).project(camera);
        if (point.z < -1 || point.z > 1 || end.z < -1 || end.z > 1) return [];
        return [{ name: label.name, major: label.major, x: (point.x + 1) * 700, y: (1 - point.y) * 450, dx: (end.x - point.x) * 1400, dy: (point.y - end.y) * 900 }];
      });
      expect(selectStreetLabels(projected, 1400, 900).length).toBeGreaterThan(2);
    });
  }
});
