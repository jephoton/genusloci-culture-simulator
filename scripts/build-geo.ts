import { mkdirSync, writeFileSync } from "node:fs";
import { CITIES, type CitySlug } from "@/geo/cities";
import { type GeoFile, GeoFileSchema } from "@/geo/geo-file";
import { buildOverpassQuery, parseOverpass } from "@/geo/overpass";

// Usage: pnpm build:geo <city-slug>   (e.g. london)
// One Overpass request per run; please don't loop this (Overpass fair-use policy).
const ENDPOINT = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "GenusLoci/0.1 (Qloo hackathon; https://github.com/jephoton/genusloci-culture-simulator)";

async function main() {
  const slug = process.argv[2] as CitySlug | undefined;
  if (!slug || !(slug in CITIES)) {
    console.error(`Usage: pnpm build:geo <${Object.keys(CITIES).join("|")}>`);
    process.exit(1);
  }
  const city = CITIES[slug];
  const query = buildOverpassQuery(city, city.radiusM);
  console.log(`Fetching ${city.name} (${city.radiusM} m radius) from Overpass…`);
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": USER_AGENT },
    body: new URLSearchParams({ data: query }),
  });
  if (!res.ok) {
    console.error(`Overpass returned ${res.status}: ${(await res.text()).slice(0, 300)}`);
    process.exit(1);
  }
  const geo = parseOverpass(await res.json(), city, city.radiusM);
  const file: GeoFile = GeoFileSchema.parse({
    version: 1,
    city: { slug: city.slug, name: city.name, lat: city.lat, lon: city.lon },
    radiusM: city.radiusM,
    attribution: "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)",
    fetchedAt: new Date().toISOString(),
    geo,
  });
  mkdirSync("public/geo", { recursive: true });
  const out = `public/geo/${city.slug}.json`;
  const json = JSON.stringify(file);
  writeFileSync(out, json);
  console.log(
    `Wrote ${out}: ${geo.roads.length} roads, ${geo.water.length} water, ${geo.parks.length} parks, ${(json.length / 1024).toFixed(0)} KB`,
  );
}

main().catch((e: unknown) => {
  console.error(e);
  process.exit(1);
});
