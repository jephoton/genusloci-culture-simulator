import type { VenueKind } from "@/world/schema";

const g = (s: string) => `urn:tag:genre:place:${s}`;

/** One union `filter.tags` place query per venue kind (tag ids verified against /v2/tags; see qloo-notes.md). */
export const KIND_QUERIES: { kind: VenueKind; tags: string[] }[] = [
  { kind: "club", tags: [g("night_club"), g("gay_night_club")] },
  { kind: "bar", tags: [g("pub"), g("restaurant:cocktail_bar"), g("restaurant:wine_bar"), g("restaurant:bar"), g("brewery")] },
  { kind: "cafe", tags: [g("restaurant:cafe"), g("restaurant:coffee_shop")] },
  { kind: "restaurant", tags: [g("restaurant")] },
  { kind: "gallery", tags: [g("art_gallery"), g("museum")] },
  { kind: "music_venue", tags: [g("live_music_venue"), g("concert_hall"), g("jazz_club")] },
  { kind: "shop", tags: [g("record_store")] },
  { kind: "stadium", tags: [g("stadium")] },
  { kind: "other", tags: [g("performing_arts_theater")] },
];

/**
 * Kind from a venue's own genre/category tags, most specific first, so a cocktail bar that is also a
 * restaurant draws as a bar and a club that serves food as a club. Falls back to the query's kind.
 */
const PRIORITY: { kind: VenueKind; match: RegExp }[] = [
  { kind: "stadium", match: /:(stadium|arena)$/ },
  { kind: "club", match: /:(night_club|gay_night_club|dance_club)$/ },
  { kind: "music_venue", match: /:(live_music_venue|concert_hall|jazz_club|music_venue)$/ },
  { kind: "gallery", match: /:(art_gallery|museum|art_museum|art_center)$/ },
  { kind: "bar", match: /:(pub|bar|cocktail_bar|wine_bar|brewery|beer_bar|sports_bar)$/ },
  { kind: "cafe", match: /:(cafe|coffee_shop|coffee|tea_house)$/ },
  { kind: "shop", match: /:(record_store|book_store|clothing_store|store)$/ },
  { kind: "restaurant", match: /:restaurant$/ },
];

export function kindOf(tagIds: readonly string[], fallback: VenueKind): VenueKind {
  const genre = tagIds.filter((t) => t.startsWith("urn:tag:genre:place:") || t.startsWith("urn:tag:category:place:"));
  for (const { kind, match } of PRIORITY) if (genre.some((t) => match.test(t))) return kind;
  return fallback;
}

/** Relative weekly capacity by kind (normalised over the city by the builder). */
export const KIND_CAPACITY: Record<VenueKind, number> = {
  club: 1.5,
  music_venue: 2,
  bar: 0.8,
  cafe: 0.5,
  restaurant: 0.7,
  gallery: 1.2,
  shop: 0.4,
  stadium: 4,
  other: 1.5,
};
