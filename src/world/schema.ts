import { z } from "zod";

/** Entity kinds. Mirrors Qloo's urn:entity:* types, plus "tag" for taste tags used as genes. */
export const ENTITY_TYPES = [
  "artist", "place", "brand", "movie", "tv_show", "book",
  "podcast", "video_game", "destination", "person", "tag",
] as const;

/** Landmark styles for venues (Plan 4 maps Qloo tags to these). */
export const VENUE_KINDS = [
  "club", "bar", "cafe", "restaurant", "gallery", "music_venue", "shop", "stadium", "other",
] as const;

const index = z.number().int().nonnegative();

export const EntitySchema = z.object({
  id: z.string().min(1),
  name: z.string(),
  type: z.enum(ENTITY_TYPES),
  tags: z.array(z.string()),
  popularity: z.number().min(0).max(1),
  /** Present for venues (type "place"): index into cells. */
  cell: index.optional(),
  /** Visitors per tick at which the venue counts as full. */
  capacity: z.number().positive().optional(),
  /** Landmark style for venues. */
  kind: z.enum(VENUE_KINDS).optional(),
});

export const EdgeSchema = z.object({
  source: index,
  target: index,
  /** Affinity in [0, 1]. */
  weight: z.number().min(0).max(1),
});

export const CellSchema = z.object({
  geohash: z.string(),
  lat: z.number(),
  lon: z.number(),
  /** Relative population density; drives agent placement. */
  density: z.number().nonnegative(),
  archetypes: z.array(z.object({ archetype: index, weight: z.number().nonnegative() })),
});

export const ArchetypeSchema = z.object({
  id: z.string(),
  name: z.string(),
  genes: z.array(z.object({ entity: index, weight: z.number().min(0).max(1) })).min(1),
});

export const HeatmapSchema = z.object({
  entity: index,
  /** One affinity value per cell, same order as `cells`. */
  values: z.array(z.number()),
});

const point = z.tuple([z.number(), z.number()]);

/** City geometry in local metres relative to `city` (x east, y north). From OpenStreetMap in real worlds. */
export const GeoSchema = z.object({
  bounds: z.object({ minX: z.number(), minY: z.number(), maxX: z.number(), maxY: z.number() }),
  roads: z.array(z.object({ kind: z.enum(["major", "minor"]), points: z.array(point).min(2) })),
  water: z.array(z.array(point).min(3)),
  parks: z.array(z.array(point).min(3)),
});

export const WorldSchema = z
  .object({
    version: z.literal(1),
    city: z.object({ name: z.string(), lat: z.number(), lon: z.number() }),
    entities: z.array(EntitySchema).min(1),
    edges: z.array(EdgeSchema),
    cells: z.array(CellSchema).min(1),
    archetypes: z.array(ArchetypeSchema).min(1),
    heatmaps: z.array(HeatmapSchema),
    geo: GeoSchema.optional(),
  })
  .superRefine((w, ctx) => {
    const nE = w.entities.length;
    const nC = w.cells.length;
    const nA = w.archetypes.length;
    const fail = (message: string) => ctx.addIssue({ code: "custom", message });
    w.edges.forEach((e, i) => {
      if (e.source >= nE || e.target >= nE) fail(`edges[${i}] references a missing entity`);
    });
    w.entities.forEach((e, i) => {
      if (e.cell !== undefined && e.cell >= nC) fail(`entities[${i}].cell out of range`);
    });
    w.cells.forEach((c, i) => {
      c.archetypes.forEach((a) => {
        if (a.archetype >= nA) fail(`cells[${i}] references a missing archetype`);
      });
    });
    w.archetypes.forEach((a, i) => {
      a.genes.forEach((g) => {
        if (g.entity >= nE) fail(`archetypes[${i}] references a missing entity`);
      });
    });
    w.heatmaps.forEach((h, i) => {
      if (h.entity >= nE) fail(`heatmaps[${i}] references a missing entity`);
      if (h.values.length !== nC) fail(`heatmaps[${i}] must have one value per cell`);
    });
    if (w.geo && (w.geo.bounds.minX >= w.geo.bounds.maxX || w.geo.bounds.minY >= w.geo.bounds.maxY)) {
      fail("geo.bounds must have min < max");
    }
  });

export type World = z.infer<typeof WorldSchema>;
export type EntityType = (typeof ENTITY_TYPES)[number];
export type VenueKind = (typeof VENUE_KINDS)[number];
export type Geo = z.infer<typeof GeoSchema>;

export function parseWorld(json: unknown): World {
  return WorldSchema.parse(json);
}
