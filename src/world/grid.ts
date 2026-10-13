import { clipPolyline, pointInPolygon } from "@/geo/geometry";
import type { Geo } from "@/world/schema";

/** Centres (local metres) of a square grid of `cellSizeM` cells over the bounds, skipping cells centred in water. */
export function gridCentres(geo: Geo, cellSizeM: number): [number, number][] {
  const b = geo.bounds;
  const centres: [number, number][] = [];
  for (let y = b.minY + cellSizeM / 2; y < b.maxY; y += cellSizeM) {
    for (let x = b.minX + cellSizeM / 2; x < b.maxX; x += cellSizeM) {
      if (!geo.water.some((ring) => pointInPolygon(x, y, ring))) centres.push([x, y]);
    }
  }
  return centres;
}

/** Street length inside each cell (major roads count 1.5×): a proxy for urban density. */
export function streetLengths(geo: Geo, centres: [number, number][], cellSizeM: number): number[] {
  return centres.map(([cx, cy]) => {
    const rect = { minX: cx - cellSizeM / 2, maxX: cx + cellSizeM / 2, minY: cy - cellSizeM / 2, maxY: cy + cellSizeM / 2 };
    let len = 0;
    for (const road of geo.roads) {
      for (const piece of clipPolyline(road.points, rect)) {
        for (let i = 0; i + 1 < piece.length; i++) {
          len += Math.hypot(piece[i + 1][0] - piece[i][0], piece[i + 1][1] - piece[i][1]) * (road.kind === "major" ? 1.5 : 1);
        }
      }
    }
    return len;
  });
}

/** Relative density per cell: 0.05 plus street length over the busiest cell's. */
export function streetDensity(geo: Geo, centres: [number, number][], cellSizeM: number): number[] {
  const lengths = streetLengths(geo, centres, cellSizeM);
  const maxLen = Math.max(1, ...lengths);
  return lengths.map((l) => 0.05 + l / maxLen);
}
