import { CITIES, type CitySlug } from "@/geo/cities";
import { fileCache } from "@/qloo/cache";
import { qlooFromEnv } from "@/qloo/env";
import { isInvalidSignal } from "@/qloo/transport";

// Usage: pnpm qloo:smoke [city-slug]   (default london)
// A handful of live Qloo calls through the file cache (.cache/qloo, git-ignored), so reruns are free.
// Prints counts and quota only, never response data (Qloo terms).

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to the real environment
}

async function main() {
  const slug = (process.argv[2] ?? "london") as CitySlug;
  const city = CITIES[slug];
  if (!city) throw new Error(`Unknown city "${slug}" (${Object.keys(CITIES).join(", ")})`);
  const { client: q, transport } = qlooFromEnv({ cache: fileCache() });
  const at = { lat: city.lat, lon: city.lon };
  const radiusM = city.radiusM;

  const check = (label: string, n: number, min = 1) => {
    console.log(`${n >= min ? "ok  " : "FAIL"} ${label}: ${n}`);
    if (n < min) process.exitCode = 1;
  };

  const places = await q.places({ at, radiusM, take: 50 });
  check("places in the city circle", places.length);
  check("places with coordinates", places.filter((p) => p.location).length);
  check("avg tags per place", Math.round(places.reduce((s, p) => s + p.tags.length, 0) / Math.max(1, places.length)));

  const clubs = await q.places({ at, radiusM, tags: ["urn:tag:genre:place:night_club"], take: 20 });
  check("night clubs", clubs.length);

  // Not every venue has cross-domain data; Qloo answers 400 "signal entities were invalid" for those.
  let anchor = clubs[0] ?? places[0];
  let artists: Awaited<ReturnType<typeof q.recommend>> = [];
  let tried = 0;
  for (const v of [...clubs, ...places].slice(0, 10)) {
    tried++;
    try {
      artists = await q.recommend("urn:entity:artist", { signalEntities: [v.id], take: 10 });
      anchor = v;
      break;
    } catch (e) {
      if (!isInvalidSignal(e)) throw e;
    }
  }
  check(`artists for an anchor venue (venues tried: ${tried})`, artists.length);

  const tags = await q.tagAffinities({ signalEntities: [anchor.id], take: 20 });
  check("tag affinities for the anchor", tags.length);

  const heat = await q.heatmap({ at, radiusM, signalEntities: [anchor.id] });
  check("heatmap cells inside the radius", heat.length);

  const found = await q.searchTags({ query: "techno", take: 5 });
  check("tag search results", found.length);

  const s = transport.stats();
  console.log(`\nnetwork calls ${s.calls}, cache hits ${s.cacheHits}, 429s ${s.rateLimited}, month remaining ${s.monthRemaining ?? "unknown (all cached)"}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
