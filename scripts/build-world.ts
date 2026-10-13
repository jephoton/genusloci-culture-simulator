import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { CITIES, type CitySlug } from "@/geo/cities";
import { GeoFileSchema } from "@/geo/geo-file";
import { fileCache } from "@/qloo/cache";
import { qlooFromEnv } from "@/qloo/env";
import { applySeedHeatmaps, assembleWorld, attachHeatmaps } from "@/world/builder/assemble";
import { DEMO_CONFIG, DEMO_SEED } from "@/ui/demo-config";
import { equilibrateCapacities } from "@/world/builder/equilibrate";
import { gatherCity, gatherHeatmaps } from "@/world/builder/gather";
import { parseWorld } from "@/world/schema";

// Usage: pnpm build:world <city-slug>   (e.g. london)
// Builds a World from Qloo data over the city's OSM geometry (public/geo/<city>.json) and writes it to
// .cache/worlds/<city>.world.json. Qloo data stays server-side: that folder is git-ignored and must
// never be committed (Qloo terms). Calls go through the file cache, so reruns are free.

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to the real environment
}

export const WORLD_DIR = ".cache/worlds";

async function main() {
  const slug = process.argv[2] as CitySlug | undefined;
  if (!slug || !(slug in CITIES)) {
    console.error(`Usage: pnpm build:world <${Object.keys(CITIES).join("|")}>`);
    process.exit(1);
  }
  const city = CITIES[slug];
  const file = GeoFileSchema.parse(JSON.parse(readFileSync(`public/geo/${slug}.json`, "utf8")));
  const { client, transport } = qlooFromEnv({ cache: fileCache() });
  const log = (m: string) => console.log(`  ${m}`);

  console.log(`Gathering ${city.name} from Qloo…`);
  const bundle = await gatherCity(client, city, file.geo, { onProgress: log });
  bundle.builtAt = new Date().toISOString();

  const { world: base, heatmapPlan } = assembleWorld(bundle);
  console.log("Fetching heatmaps…");
  const { seeds, checks } = await gatherHeatmaps(client, base, heatmapPlan, city, log);
  // Residents are seeded from the seed heatmaps; fidelity is measured on the held-out check heatmaps.
  const seeded = attachHeatmaps(applySeedHeatmaps(base, seeds), checks);
  // Capacities matched to the demo city's baseline crowds (see equilibrateCapacities).
  const world = parseWorld(equilibrateCapacities(seeded, DEMO_CONFIG, DEMO_SEED));

  mkdirSync(WORLD_DIR, { recursive: true });
  const out = `${WORLD_DIR}/${slug}.world.json`;
  const json = JSON.stringify(world);
  writeFileSync(out, json);

  const count = (t: string) => world.entities.filter((e) => e.type === t).length;
  const placed = world.entities.filter((e) => e.type === "place" && e.cell !== undefined);
  const kinds = new Map<string, number>();
  for (const e of placed) kinds.set(e.kind ?? "other", (kinds.get(e.kind ?? "other") ?? 0) + 1);
  console.log(`\nWrote ${out} (${(json.length / 1024).toFixed(0)} KB)`);
  console.log(`  venues ${placed.length} placed + ${count("place") - placed.length} reserve: ${[...kinds].map(([k, n]) => `${k} ${n}`).join(", ")}`);
  console.log(`  tags ${count("tag")}, artists ${count("artist")}, edges ${world.edges.length}, cells ${world.cells.length}, heatmaps ${world.heatmaps.length}`);
  console.log(`  scenes: ${world.archetypes.map((a) => a.name).join(" | ")}`);
  const s = transport.stats();
  console.log(`  Qloo: ${s.calls} network calls, ${s.cacheHits} cached, ${s.rateLimited} rate-limited; month remaining ${s.monthRemaining ?? "unknown (all cached)"}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
