export type CitySpec = { slug: string; name: string; lat: number; lon: number; radiusM: number };

/** Cities with prebuilt geometry in public/geo. The radius is half the side of the square area. */
export const CITIES = {
  london: { slug: "london", name: "London", lat: 51.5072, lon: -0.1276, radiusM: 1500 },
  // Centred between City Hall and the Singapore River: Marina Bay, Clarke Quay, the Civic District, Chinatown's edge.
  singapore: { slug: "singapore", name: "Singapore", lat: 1.2905, lon: 103.8505, radiusM: 1500 },
} satisfies Record<string, CitySpec>;

export type CitySlug = keyof typeof CITIES;
