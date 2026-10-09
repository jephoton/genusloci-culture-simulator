import type { GeoFile } from "@/geo/geo-file";
import { clipPolyline, pointInPolygon } from "@/geo/geometry";
import { createRng } from "@/sim/rng";
import { fromLocalMetres } from "@/world/projection";
import { VENUE_KINDS, type World } from "@/world/schema";

const VENUES_PER_CLUSTER = 4;

/**
 * A synthetic population over real geography, used until Qloo data exists (Plan 4). Synthetic only:
 * it carries no Qloo responses.
 * - Cells: a square grid over the bounds, skipping cells whose centre is in water.
 * - Density: street length per cell (a proxy for urban density).
 * - Scenes: each taste cluster has a home district, and a cell's archetype mix falls off with
 *   distance to those homes, so scenes have neighbourhoods.
 * - Venues: placed in cells weighted by density × that cluster's share there.
 */
export function makeSyntheticCity(
  file: GeoFile,
  opts: { seed?: number; clusters?: number; entitiesPerCluster?: number; cellSizeM?: number } = {},
): World {
  const { seed = 7, clusters = 6, entitiesPerCluster = 20, cellSizeM = 500 } = opts;
  const rng = createRng(seed);
  const { geo, city } = file;
  const b = geo.bounds;

  const centres: [number, number][] = [];
  for (let y = b.minY + cellSizeM / 2; y < b.maxY; y += cellSizeM) {
    for (let x = b.minX + cellSizeM / 2; x < b.maxX; x += cellSizeM) {
      if (!geo.water.some((ring) => pointInPolygon(x, y, ring))) centres.push([x, y]);
    }
  }

  const streetLength = centres.map(([cx, cy]) => {
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
  const maxLen = Math.max(1, ...streetLength);

  const homes = Array.from({ length: clusters }, (): [number, number] => [
    b.minX + (0.15 + 0.7 * rng.next()) * (b.maxX - b.minX),
    b.minY + (0.15 + 0.7 * rng.next()) * (b.maxY - b.minY),
  ]);
  const falloff = (b.maxX - b.minX) / 4;

  const cells: World["cells"] = centres.map(([x, y], i) => {
    const raw = homes.map(([hx, hy]) => Math.exp(-Math.hypot(x - hx, y - hy) / falloff));
    const total = raw.reduce((a, v) => a + v, 0);
    const p = fromLocalMetres({ x, y }, city);
    return {
      geohash: `cell${i}`,
      lat: p.lat,
      lon: p.lon,
      density: 0.05 + streetLength[i] / maxLen,
      archetypes: raw.map((v, archetype) => ({ archetype, weight: v / total })),
    };
  });

  const idx = (c: number, j: number) => c * entitiesPerCluster + j;
  const pickCell = (cluster: number) => {
    const weights = cells.map((cell) => cell.density * cell.archetypes[cluster].weight);
    let r = rng.next() * weights.reduce((a, v) => a + v, 0);
    for (let i = 0; i < weights.length; i++) {
      r -= weights[i];
      if (r < 0) return i;
    }
    return weights.length - 1;
  };

  const entities: World["entities"] = [];
  for (let c = 0; c < clusters; c++) {
    for (let j = 0; j < entitiesPerCluster; j++) {
      const isVenue = j < VENUES_PER_CLUSTER;
      entities.push({
        id: `syn:${c}:${j}`,
        name: `Cluster ${c} ${isVenue ? "Venue" : "Artist"} ${j}`,
        type: isVenue ? "place" : "artist",
        tags: [`syn:genre:${c}`],
        popularity: rng.next(),
        ...(isVenue
          ? { cell: pickCell(c), capacity: 50, kind: VENUE_KINDS[(c * VENUES_PER_CLUSTER + j) % VENUE_KINDS.length] }
          : {}),
      });
    }
  }

  const edges: World["edges"] = [];
  for (let c = 0; c < clusters; c++) {
    for (let j = 0; j < entitiesPerCluster; j++) {
      for (let k = 0; k < entitiesPerCluster; k++) {
        if (j !== k) edges.push({ source: idx(c, j), target: idx(c, k), weight: 0.5 + 0.5 * rng.next() });
      }
      if (clusters > 1) {
        const other = (c + 1 + rng.int(clusters - 1)) % clusters;
        edges.push({ source: idx(c, j), target: idx(other, rng.int(entitiesPerCluster)), weight: 0.05 + 0.1 * rng.next() });
      }
    }
  }

  const archetypes: World["archetypes"] = Array.from({ length: clusters }, (_, c) => ({
    id: `syn:arch:${c}`,
    name: `Synthetic scene ${c}`,
    genes: Array.from({ length: entitiesPerCluster - VENUES_PER_CLUSTER }, (_, k) => ({
      entity: idx(c, VENUES_PER_CLUSTER + k),
      weight: 0.6 + 0.4 * rng.next(),
    })),
  }));

  const heatmaps: World["heatmaps"] = Array.from({ length: clusters }, (_, c) => ({
    entity: idx(c, VENUES_PER_CLUSTER),
    values: cells.map((cell) => cell.archetypes[c].weight),
  }));

  return {
    version: 1,
    city: { name: city.name, lat: city.lat, lon: city.lon },
    entities,
    edges,
    cells,
    archetypes,
    heatmaps,
    geo,
  };
}
