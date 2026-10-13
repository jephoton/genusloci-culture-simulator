import { z } from "zod";

// Qloo responses are verbose (~22 KB per place). These schemas accept only the fields we use;
// the trim* helpers map them to small, stable types before anything is cached.

const num = z.number().nullish();
const str = z.string().nullish();

const RawTag = z.looseObject({
  id: str,
  tag_id: str,
  name: str,
  type: str,
  subtype: str,
  popularity: num,
  query: z.looseObject({ affinity: num }).nullish(),
});

const RawEntity = z.looseObject({
  entity_id: z.string(),
  name: z.string(),
  subtype: str,
  types: z.array(z.string()).nullish(),
  popularity: num,
  location: z.looseObject({ lat: z.number(), lon: z.number(), geohash: str }).nullish(),
  tags: z.array(RawTag).nullish(),
  query: z.looseObject({ affinity: num, distance: num }).nullish(),
  properties: z
    .looseObject({
      address: str,
      neighborhood: str,
      description: str,
      short_description: str,
      price_level: num,
      business_rating: num,
      is_closed: z.boolean().nullish(),
      live_music: z.boolean().nullish(),
      keywords: z.array(z.looseObject({ name: z.string(), count: num })).nullish(),
    })
    .nullish(),
});

export interface QTag {
  id: string;
  name: string;
  type?: string;
  popularity?: number;
  /** Present when the request carried a signal (taste analysis). */
  affinity?: number;
}

export interface QEntity {
  id: string;
  name: string;
  /** e.g. `urn:entity:place`, `urn:entity:artist`. */
  type?: string;
  popularity?: number;
  /** 0–1 affinity to the request's signal, when one was given. */
  affinity?: number;
  /** Metres from the requested location, when one was given. */
  distance?: number;
  location?: { lat: number; lon: number; geohash?: string };
  tags: QTag[];
  description?: string;
  /** Place-only details. */
  place?: {
    address?: string;
    neighborhood?: string;
    priceLevel?: number;
    rating?: number;
    isClosed?: boolean;
    liveMusic?: boolean;
    keywords?: { name: string; count: number }[];
  };
}

export interface QHeatCell {
  lat: number;
  lon: number;
  geohash: string;
  affinity: number;
  affinityRank: number;
  popularity: number;
}

export interface QAudience {
  id: string;
  name: string;
  type?: string;
}

export interface QDemographics {
  id: string;
  age: Record<string, number>;
  gender: Record<string, number>;
}

/** `urn:tag:genre:place:night_club` → `night club` (some tags arrive without a name). */
const humanise = (urn: string): string => (urn.split(":").pop() ?? urn).replace(/_/g, " ");

const opt = <T>(v: T | null | undefined): T | undefined => (v === null ? undefined : v);

function trimTag(t: z.infer<typeof RawTag>): QTag | null {
  const id = t.id ?? t.tag_id;
  if (!id) return null;
  return {
    id,
    name: t.name?.trim() || humanise(id),
    type: opt(t.type ?? t.subtype),
    popularity: opt(t.popularity),
    affinity: opt(t.query?.affinity),
  };
}

function trimEntity(e: z.infer<typeof RawEntity>): QEntity {
  const p = e.properties;
  const isPlace = (e.subtype ?? e.types?.[0]) === "urn:entity:place";
  return {
    id: e.entity_id,
    name: e.name,
    type: opt(e.subtype ?? e.types?.[0]),
    popularity: opt(e.popularity),
    affinity: opt(e.query?.affinity),
    distance: opt(e.query?.distance),
    location: e.location ? { lat: e.location.lat, lon: e.location.lon, geohash: opt(e.location.geohash) } : undefined,
    tags: (e.tags ?? []).map(trimTag).filter((t): t is QTag => t !== null),
    description: opt(p?.short_description ?? p?.description),
    place:
      isPlace && p
        ? {
            address: opt(p.address),
            neighborhood: opt(p.neighborhood),
            priceLevel: opt(p.price_level),
            rating: opt(p.business_rating),
            isClosed: opt(p.is_closed),
            liveMusic: opt(p.live_music),
            keywords: p.keywords?.map((k) => ({ name: k.name, count: k.count ?? 0 })),
          }
        : undefined,
  };
}

/** Drops undefined keys so cached JSON stays small and round-trips exactly. */
function compact<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

export const parseInsightEntities = (json: unknown): QEntity[] =>
  compact(z.object({ results: z.object({ entities: z.array(RawEntity) }) }).parse(json).results.entities.map(trimEntity));

/** `/search` and `/entities` return `results` as a bare array. */
export const parseEntityList = (json: unknown): QEntity[] =>
  compact(z.object({ results: z.array(RawEntity) }).parse(json).results.map(trimEntity));

export const parseTags = (json: unknown): QTag[] =>
  compact(
    z
      .object({ results: z.object({ tags: z.array(RawTag) }) })
      .parse(json)
      .results.tags.map(trimTag)
      .filter((t): t is QTag => t !== null),
  );

export const parseHeatmap = (json: unknown): QHeatCell[] =>
  z
    .object({
      results: z.object({
        heatmap: z.array(
          z.looseObject({
            location: z.looseObject({ latitude: z.number(), longitude: z.number(), geohash: z.string() }),
            query: z.looseObject({ affinity: z.number(), affinity_rank: num, popularity: num }),
          }),
        ),
      }),
    })
    .parse(json)
    .results.heatmap.map((c) => ({
      lat: c.location.latitude,
      lon: c.location.longitude,
      geohash: c.location.geohash,
      affinity: c.query.affinity,
      affinityRank: c.query.affinity_rank ?? 0,
      popularity: c.query.popularity ?? 0,
    }));

export const parseAudiences = (json: unknown): QAudience[] =>
  compact(
    z
      .object({ results: z.object({ audiences: z.array(z.looseObject({ id: z.string(), name: z.string(), type: str })) }) })
      .parse(json)
      .results.audiences.map((a) => ({ id: a.id, name: a.name, type: opt(a.type) })),
  );

export const parseAudienceTypes = (json: unknown): string[] =>
  z
    .object({ results: z.object({ audience_types: z.array(z.looseObject({ type: z.string() })) }) })
    .parse(json)
    .results.audience_types.map((t) => t.type);

export const parseDemographics = (json: unknown): QDemographics[] =>
  z
    .object({
      results: z.object({
        demographics: z.array(
          z.looseObject({
            entity_id: z.string(),
            query: z.looseObject({
              age: z.record(z.string(), z.number()).nullish(),
              gender: z.record(z.string(), z.number()).nullish(),
            }),
          }),
        ),
      }),
    })
    .parse(json)
    .results.demographics.map((d) => ({ id: d.entity_id, age: d.query.age ?? {}, gender: d.query.gender ?? {} }));
