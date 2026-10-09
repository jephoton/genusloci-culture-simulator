import { createRng } from "@/sim/rng";
import { syntheticGeo } from "@/world/fixtures/synthetic-geo";
import { VENUE_KINDS, type World } from "@/world/schema";

/**
 * Deterministic synthetic World for tests and benchmarks.
 * Synthetic data only: Qloo responses must never be committed (Qloo terms).
 *
 * Shape: `clusters` taste clusters ("genres"), each with `entitiesPerCluster`
 * entities. The first 4 of each cluster are venues, the rest artists. The grid
 * is gridSize × gridSize cells; each column is dominated by one cluster's archetype.
 */
export function makeTinyWorld(
  opts: { seed?: number; clusters?: number; entitiesPerCluster?: number; gridSize?: number } = {},
): World {
  const { seed = 1, clusters = 3, entitiesPerCluster = 12, gridSize = 4 } = opts;
  const rng = createRng(seed);
  const nCells = gridSize * gridSize;
  const idx = (c: number, j: number) => c * entitiesPerCluster + j;
  const VENUES_PER_CLUSTER = 4;

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
          ? { cell: rng.int(nCells), capacity: 50, kind: VENUE_KINDS[(c * VENUES_PER_CLUSTER + j) % VENUE_KINDS.length] }
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

  const cells: World["cells"] = [];
  for (let row = 0; row < gridSize; row++) {
    for (let col = 0; col < gridSize; col++) {
      const dominant = col % clusters;
      const archetypes = [{ archetype: dominant, weight: 0.8 }];
      if (clusters > 1) archetypes.push({ archetype: (col + 1) % clusters, weight: 0.2 });
      cells.push({
        geohash: `syn${row}${col}`,
        lat: 51.5 + row * 0.01,
        lon: -0.1 + col * 0.01,
        density: 1 + rng.next(),
        archetypes,
      });
    }
  }

  const archetypes: World["archetypes"] = [];
  for (let c = 0; c < clusters; c++) {
    const genes: World["archetypes"][number]["genes"] = [];
    for (let j = VENUES_PER_CLUSTER; j < entitiesPerCluster; j++) {
      genes.push({ entity: idx(c, j), weight: 0.6 + 0.4 * rng.next() });
    }
    archetypes.push({ id: `syn:arch:${c}`, name: `Synthetic scene ${c}`, genes });
  }

  const heatmaps: World["heatmaps"] = [];
  for (let c = 0; c < clusters; c++) {
    heatmaps.push({
      entity: idx(c, VENUES_PER_CLUSTER),
      values: cells.map((cell) => cell.archetypes.find((a) => a.archetype === c)?.weight ?? 0),
    });
  }

  const city = { name: "Synthville", lat: 51.5, lon: -0.1 };
  return { version: 1, city, entities, edges, cells, archetypes, heatmaps, geo: syntheticGeo(cells, city) };
}
