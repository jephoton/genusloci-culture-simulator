import { z } from "zod";
import { GeoSchema } from "@/world/schema";

/** A city's geometry as stored in public/geo/<slug>.json (OpenStreetMap-derived, ODbL). */
export const GeoFileSchema = z.object({
  version: z.literal(1),
  city: z.object({ slug: z.string(), name: z.string(), lat: z.number(), lon: z.number() }),
  radiusM: z.number().positive(),
  attribution: z.string(),
  fetchedAt: z.string(),
  geo: GeoSchema,
});

export type GeoFile = z.infer<typeof GeoFileSchema>;
