import type { GeoFile } from "@/geo/geo-file";
import { createRng, type Rng } from "@/sim/rng";
import { gridCentres, streetDensity } from "@/world/grid";
import { fromLocalMetres } from "@/world/projection";
import { VENUE_KINDS, type World } from "@/world/schema";

const VENUES_PER_CLUSTER = 4;
/**
 * A cluster's pull falls off as exp(-distance / (FALLOFF_FRAC × city width)): sharp enough that each
 * neighbourhood is dominated by one or two scenes, as real Qloo heatmaps are local.
 */
const FALLOFF_FRAC = 1 / 12;
/** Share of every cell spread evenly over all clusters, so no neighbourhood is a monoculture (≥ 10% minority). */
const MIXING = 0.15;

/** Each taste cluster's home district, drawn uniformly from the middle 70% of the bounds. */
export function clusterHomes(b: GeoFile["geo"]["bounds"], clusters: number, rng: Rng): [number, number][] {
  return Array.from({ length: clusters }, (): [number, number] => [
    b.minX + (0.15 + 0.7 * rng.next()) * (b.maxX - b.minX),
    b.minY + (0.15 + 0.7 * rng.next()) * (b.maxY - b.minY),
  ]);
}

/**
 * A point's archetype mix: a softmax over clusters of -distance-to-home / falloff (the temperature),
 * blended with `mixing` of the uniform mix. Sums to 1.
 */
export function neighbourhoodMix(x: number, y: number, homes: [number, number][], falloff: number, mixing: number): number[] {
  const logits = homes.map(([hx, hy]) => -Math.hypot(x - hx, y - hy) / falloff);
  const top = Math.max(...logits);
  const raw = logits.map((l) => Math.exp(l - top));
  const total = raw.reduce((a, v) => a + v, 0);
  return raw.map((v) => (1 - mixing) * (v / total) + mixing / homes.length);
}

/**
 * A synthetic population over real geography, used until Qloo data exists (M4). Synthetic only:
 * it carries no Qloo responses.
 * - Cells: a square grid over the bounds, skipping cells whose centre is in water.
 * - Density: street length per cell (a proxy for urban density).
 * - Scenes: each taste cluster has a home district, and a cell's archetype mix falls off sharply with
 *   distance to those homes (`neighbourhoodMix`), so each neighbourhood has one or two dominant scenes.
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

  const centres = gridCentres(geo, cellSizeM);
  const density = streetDensity(geo, centres, cellSizeM);

  const homes = clusterHomes(b, clusters, rng);
  const falloff = FALLOFF_FRAC * (b.maxX - b.minX);

  const cells: World["cells"] = centres.map(([x, y], i) => {
    const mix = neighbourhoodMix(x, y, homes, falloff, MIXING);
    const p = fromLocalMetres({ x, y }, city);
    return {
      geohash: `cell${i}`,
      lat: p.lat,
      lon: p.lon,
      density: density[i],
      archetypes: mix.map((weight, archetype) => ({ archetype, weight })),
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
