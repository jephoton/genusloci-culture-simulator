import type { QlooClient } from "@/qloo/client";
import type { QEntity, QHeatCell } from "@/qloo/schemas";
import { isInvalidSignal } from "@/qloo/transport";
import type { CityBundle, GatheredVenue, HeatmapPlan } from "@/world/builder/assemble";
import { KIND_QUERIES } from "@/world/builder/kinds";
import type { Geo, VenueKind, World } from "@/world/schema";

export type City = CityBundle["city"];

export interface GatherOptions {
  /** Venues whose crowd's artists we fetch (successful calls). */
  anchors: number;
  /** Give up looking for anchors after this many venues (some have no artist data). */
  maxAnchorTries: number;
  artistsPerVenue: number;
  onProgress: (message: string) => void;
}

export const GATHER_DEFAULTS: GatherOptions = { anchors: 30, maxAnchorTries: 50, artistsPerVenue: 15, onProgress: () => {} };

/** Kinds whose crowds say most about music taste, in the order anchors are drawn from. */
const ANCHOR_KINDS: VenueKind[] = ["club", "music_venue", "bar", "gallery", "other"];

/** The query circle covers the square OSM bounds (half-side radiusM), corners included. */
const queryRadius = (city: City) => Math.round(city.radiusM * Math.SQRT2);

/** Fetches a city's venues (one query per kind) and the artists for its anchor venues. */
export async function gatherCity(q: QlooClient, city: City, geo: Geo, options: Partial<GatherOptions> = {}): Promise<CityBundle> {
  const o = { ...GATHER_DEFAULTS, ...options };
  const at = { lat: city.lat, lon: city.lon };
  const radiusM = queryRadius(city);

  const venues: GatheredVenue[] = [];
  for (const { kind, tags } of KIND_QUERIES) {
    const found = await q.places({ at, radiusM, tags, take: 50 });
    o.onProgress(`${kind}: ${found.length} places`);
    for (const entity of found) venues.push({ entity, queryKind: kind });
  }

  // Anchors: the most popular venues of each anchor kind, taking the best of each kind in turn.
  const seen = new Set<string>();
  const byKind = ANCHOR_KINDS.map((kind) =>
    venues
      .filter((v) => v.queryKind === kind)
      .map((v) => v.entity)
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
      .filter((e) => !seen.has(e.id) && seen.add(e.id)),
  );
  const anchorOrder: QEntity[] = [];
  for (let i = 0; byKind.some((l) => i < l.length); i++) for (const list of byKind) if (i < list.length) anchorOrder.push(list[i]);

  const artistsByVenue: Record<string, QEntity[]> = {};
  let ok = 0;
  let tries = 0;
  for (const venue of anchorOrder) {
    if (ok >= o.anchors || tries >= o.maxAnchorTries) break;
    tries++;
    try {
      const artists = await q.recommend("urn:entity:artist", { signalEntities: [venue.id], take: o.artistsPerVenue });
      if (artists.length > 0) {
        artistsByVenue[venue.id] = artists;
        ok++;
      }
    } catch (e) {
      if (!isInvalidSignal(e)) throw e;
    }
  }
  o.onProgress(`artists: ${ok} anchor venues of ${tries} tried`);

  return { city, geo, venues, artistsByVenue };
}

/**
 * One heatmap per archetype: tries the plan's candidates in order (skipping entities already used and
 * ones Qloo has no data for) until one returns cells.
 */
export async function gatherHeatmaps(
  q: QlooClient,
  world: World,
  plan: HeatmapPlan,
  city: City,
  onProgress: (message: string) => void = () => {},
): Promise<{ entity: number; cells: QHeatCell[] }[]> {
  const at = { lat: city.lat, lon: city.lon };
  const used = new Set<number>();
  const results: { entity: number; cells: QHeatCell[] }[] = [];
  for (const { archetype, candidates } of plan) {
    for (const entity of candidates) {
      if (used.has(entity)) continue;
      try {
        const cells = await q.heatmap({ at, radiusM: queryRadius(city), signalEntities: [world.entities[entity].id] });
        if (cells.length === 0) continue;
        used.add(entity);
        results.push({ entity, cells });
        onProgress(`heatmap for archetype ${archetype}: ${world.entities[entity].name} (${cells.length} cells)`);
        break;
      } catch (e) {
        if (!isInvalidSignal(e)) throw e;
      }
    }
  }
  return results;
}
