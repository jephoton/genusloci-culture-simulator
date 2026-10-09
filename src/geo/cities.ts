export type CitySpec = { slug: string; name: string; lat: number; lon: number; radiusM: number };

/** Cities with prebuilt geometry in public/geo. The radius is half the side of the square area. */
export const CITIES = {
  london: { slug: "london", name: "London", lat: 51.5072, lon: -0.1276, radiusM: 3000 },
} satisfies Record<string, CitySpec>;

export type CitySlug = keyof typeof CITIES;
