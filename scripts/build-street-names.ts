import { writeFileSync } from "node:fs";
import { CITIES } from "../src/geo/cities";
import { parseOverpass } from "../src/geo/overpass";

// One combined public Overpass query, with no Qloo calls or changes to existing geometry/worlds.
// Usage: npx tsx scripts/build-street-names.ts
async function main() {
  const boxes = Object.values(CITIES).map((city) => {
    const lat = city.radiusM / 110540;
    const lon = city.radiusM / (111320 * Math.cos(city.lat * Math.PI / 180));
    return `way["highway"~"^(primary|secondary|tertiary|residential|unclassified|living_street|pedestrian)$"]["name"](${city.lat - lat},${city.lon - lon},${city.lat + lat},${city.lon + lon});`;
  });
  const response = await fetch(process.env.OVERPASS_URL ?? "https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": "GenusLoci/0.1 (Qloo hackathon; OpenStreetMap street labels)" },
    body: new URLSearchParams({ data: `[out:json][timeout:180];(${boxes.join("\n")});out geom;` }),
  });
  if (!response.ok) throw new Error(`Overpass returned ${response.status}`);
  const data = await response.json();
  for (const city of Object.values(CITIES)) {
    const roads = parseOverpass(data, city, city.radiusM).roads.filter((road) => road.name);
    const file = { version: 1, city: { slug: city.slug, lat: city.lat, lon: city.lon }, attribution: "© OpenStreetMap contributors, ODbL 1.0 (https://www.openstreetmap.org/copyright)", fetchedAt: new Date().toISOString(), roads };
    writeFileSync(`public/geo/${city.slug}-street-names.json`, JSON.stringify(file));
    console.log(`${city.slug}: ${roads.length} named street pieces`);
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
