import {
  parseAudiences,
  parseAudienceTypes,
  parseDemographics,
  parseEntityList,
  parseHeatmap,
  parseInsightEntities,
  parseTags,
  type QAudience,
  type QDemographics,
  type QEntity,
  type QHeatCell,
  type QTag,
} from "@/qloo/schemas";
import { QlooError, type Params, type Transport } from "@/qloo/transport";
import {
  checkAudiences,
  checkEntityIds,
  checkEntityType,
  checkLocation,
  checkOffset,
  checkTags,
  checkTake,
  type EntityType,
  type LatLon,
  wktPoint,
} from "@/qloo/validate";

export interface Signals {
  signalEntities?: readonly string[];
  signalTags?: readonly string[];
  audiences?: readonly string[];
}

export interface PlacesQuery extends Signals {
  at: LatLon;
  radiusM: number;
  /** Venue genre filter, e.g. `urn:tag:genre:place:night_club` (resolve with `searchTags` first). */
  tags?: readonly string[];
  take?: number;
  offset?: number;
}

export interface RecommendQuery extends Signals {
  /** Bias towards what's popular around a location (`signal.location`). */
  near?: { at: LatLon; radiusM: number };
  take?: number;
  offset?: number;
}

export interface HeatmapQuery extends Signals {
  at: LatLon;
  radiusM: number;
}

export interface QlooClientOptions {
  /** Called when a request with signals or filters comes back empty (often a silently ignored value). */
  onSuspectEmpty?: (path: string, params: Params) => void;
}

export interface QlooClient {
  search(query: string, opts?: { types?: readonly EntityType[]; take?: number }): Promise<QEntity[]>;
  entities(ids: readonly string[]): Promise<QEntity[]>;
  places(q: PlacesQuery): Promise<QEntity[]>;
  recommend(type: EntityType, q: RecommendQuery): Promise<QEntity[]>;
  tagAffinities(q: { signalEntities: readonly string[]; take?: number }): Promise<QTag[]>;
  heatmap(q: HeatmapQuery): Promise<QHeatCell[]>;
  demographics(ids: readonly string[]): Promise<QDemographics[]>;
  audienceTypes(): Promise<string[]>;
  audiences(q: { types: readonly string[]; take?: number }): Promise<QAudience[]>;
  searchTags(q: { query?: string; tagTypes?: readonly string[]; take?: number }): Promise<QTag[]>;
}

const R_EARTH = 6_371_000;
export function distanceM(a: LatLon, b: LatLon): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLon = (b.lon - a.lon) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH * Math.asin(Math.sqrt(h));
}

function signalParams(s: Signals): Params {
  if (s.signalEntities?.length) checkEntityIds(s.signalEntities);
  if (s.signalTags?.length) checkTags(s.signalTags);
  if (s.audiences?.length) checkAudiences(s.audiences);
  return {
    "signal.interests.entities": s.signalEntities?.length ? s.signalEntities : undefined,
    "signal.interests.tags": s.signalTags?.length ? s.signalTags : undefined,
    "signal.demographics.audiences": s.audiences?.length ? s.audiences : undefined,
  };
}

const hasSignal = (s: Signals) => Boolean(s.signalEntities?.length || s.signalTags?.length || s.audiences?.length);

export function createQlooClient(t: Transport, opts: QlooClientOptions = {}): QlooClient {
  const onEmpty =
    opts.onSuspectEmpty ??
    ((path: string, params: Params) =>
      console.warn(`[qloo] empty result for ${path}`, Object.keys(params).filter((k) => params[k] !== undefined)));

  /** GET and flag empty results for requests that carried a signal or filter. */
  async function list<T>(path: string, params: Params, parse: (j: unknown) => T[], filtered: boolean): Promise<T[]> {
    const items = await t.get(path, params, parse);
    if (filtered && items.length === 0) onEmpty(path, params);
    return items;
  }

  return {
    async search(query, { types, take = 10 } = {}) {
      checkTake(take);
      if (!query.trim()) throw new QlooError("Invalid Qloo request: empty search query");
      types?.forEach(checkEntityType);
      return list("/search", { query, types, take }, parseEntityList, false);
    },

    async entities(ids) {
      checkEntityIds(ids);
      if (ids.length === 0) return [];
      return list("/entities", { entity_ids: ids }, parseEntityList, true);
    },

    async places({ at, radiusM, tags, take = 50, offset, ...signals }) {
      checkLocation(at, radiusM);
      checkTake(take);
      if (offset !== undefined) checkOffset(offset);
      if (tags?.length) checkTags(tags);
      const params: Params = {
        "filter.type": "urn:entity:place",
        "filter.location": wktPoint(at),
        "filter.location.radius": Math.round(radiusM),
        "filter.tags": tags?.length ? tags : undefined,
        ...signalParams(signals),
        take,
        offset: offset || undefined,
      };
      return list("/v2/insights", params, parseInsightEntities, Boolean(tags?.length) || hasSignal(signals));
    },

    async recommend(type, { near, take = 20, offset, ...signals }) {
      checkEntityType(type);
      checkTake(take);
      if (offset !== undefined) checkOffset(offset);
      if (near) checkLocation(near.at, near.radiusM);
      if (!hasSignal(signals) && !near) throw new QlooError("Invalid Qloo request: recommend needs a signal or a location");
      const params: Params = {
        "filter.type": type,
        ...signalParams(signals),
        "signal.location": near ? wktPoint(near.at) : undefined,
        "signal.location.radius": near ? Math.round(near.radiusM) : undefined,
        take,
        offset: offset || undefined,
      };
      return list("/v2/insights", params, parseInsightEntities, true);
    },

    async tagAffinities({ signalEntities, take = 50 }) {
      checkTake(take);
      if (!signalEntities.length) throw new QlooError("Invalid Qloo request: tagAffinities needs signal entities");
      return list("/v2/insights", { "filter.type": "urn:tag", ...signalParams({ signalEntities }), take }, parseTags, true);
    },

    async heatmap({ at, radiusM, ...signals }) {
      checkLocation(at, radiusM);
      if (!hasSignal(signals)) throw new QlooError("Invalid Qloo request: heatmap needs a signal");
      const params: Params = {
        "filter.type": "urn:heatmap",
        "filter.location": wktPoint(at),
        "filter.location.radius": Math.round(radiusM),
        ...signalParams(signals),
      };
      const cells = await list("/v2/insights", params, parseHeatmap, true);
      // Tag and audience heatmaps come back unclipped; keep only cells inside the circle.
      return cells.filter((c) => distanceM(at, c) <= radiusM);
    },

    async demographics(ids) {
      checkEntityIds(ids);
      return list("/v2/insights", { "filter.type": "urn:demographics", "signal.interests.entities": ids }, parseDemographics, true);
    },

    async audienceTypes() {
      return list("/v2/audiences/types", {}, parseAudienceTypes, false);
    },

    async audiences({ types, take = 50 }) {
      checkTake(take);
      if (!types.length) throw new QlooError("Invalid Qloo request: audiences needs at least one audience type");
      checkAudiences(types);
      return list("/v2/audiences", { "filter.audience.types": types, take }, parseAudiences, true);
    },

    async searchTags({ query, tagTypes, take = 20 }) {
      checkTake(take);
      if (!query?.trim() && !tagTypes?.length) throw new QlooError("Invalid Qloo request: searchTags needs a query or tag types");
      return list("/v2/tags", { "filter.query": query?.trim() || undefined, "filter.tag.types": tagTypes, take }, parseTags, true);
    },
  };
}
