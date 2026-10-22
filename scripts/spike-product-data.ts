import { mkdir, writeFile } from "node:fs/promises";
import { createQlooClient } from "../src/qloo/client";
import { fileCache } from "../src/qloo/cache";
import { createTransport, QlooError } from "../src/qloo/transport";
import type { QEntity } from "../src/qloo/schemas";
import { parseInsightEntities } from "../src/qloo/schemas";

// Exploratory read-only probe. All entity results stay in ignored local storage.
// Never commit the generated reports or use affinities as attendance probabilities.
try { process.loadEnvFile(".env.local"); } catch { /* environment may already be configured */ }

async function main() {
  const key = process.env.QLOO_API_KEY?.trim();
  if (!key) throw new Error("Qloo configuration is missing.");
  let starts = 0;
  const transport = createTransport({
    apiKey: key, baseUrl: process.env.QLOO_BASE_URL, cache: fileCache(),
    budgetFloor: Math.max(1000, Number(process.env.QLOO_BUDGET_FLOOR) || 1000),
    maxRetries: 0, perSecond: 3,
    fetch: async (input, init) => {
      if (starts >= 30) throw new Error("Spike network request cap reached.");
      starts++;
      return fetch(input, { ...init, signal: AbortSignal.timeout(25000) });
    },
  });
  const q = createQlooClient(transport);
  // Spike-only domain adapter: brands return keyword strings; the current shared
  // production parser expects place keyword objects. Preserve validation after projection.
  const recommendBrands = (signal: string) => transport.get("/v2/insights", {
    "filter.type": "urn:entity:brand", "signal.interests.entities": [signal], take: 10,
  }, (json) => {
    const raw = json as { results?: { entities?: { properties?: { keywords?: unknown[] } }[] } };
    if (!raw.results?.entities) return parseInsightEntities(json);
    return parseInsightEntities({ ...raw, results: { ...raw.results, entities: raw.results.entities.map((entity) => ({
      ...entity, properties: entity.properties ? { ...entity.properties,
        keywords: entity.properties.keywords?.map((keyword) => typeof keyword === "string" ? { name: keyword } : keyword),
      } : undefined,
    })) } });
  });
  const at = { lat: 51.5072, lon: -0.1276 };
  const radiusM = 5000;
  const measurements: { probe: string; count?: number; status: string; affinityCount?: number }[] = [];
  const local: unknown[] = [];
  async function probe<T>(name: string, call: () => Promise<T[]>): Promise<T[]> {
    try {
      const result = await call();
      measurements.push({ probe: name, count: result.length, status: result.length ? "returned" : "empty" });
      local.push({ probe: name, result });
      return result;
    } catch (error) {
      const status = error instanceof QlooError ? `HTTP ${error.status ?? "network/budget"}` : error instanceof Error && error.name === "ZodError" ? "response schema mismatch" : "request failed";
      measurements.push({ probe: name, status });
      const issues = error && typeof error === "object" && "issues" in error && Array.isArray(error.issues)
        ? error.issues.map((issue: { code?: string; path?: unknown[] }) => ({ code: issue.code, path: issue.path })) : undefined;
      local.push({ probe: name, error: status, issues });
      return [];
    }
  }
  const baseline = await probe("London unconditioned places", () => q.places({ at, radiusM, take: 20 }));
  const musicTags = ["urn:tag:genre:place:night_club", "urn:tag:genre:place:live_music"];
  const tagSearch = await probe("live music tag resolution", () => q.searchTags({ query: "live music", take: 10 }));
  const resolved = tagSearch.filter((t) => t.id.startsWith("urn:tag:genre:place:") && /live.music/.test(t.id));
  const venueTags = [...new Set([musicTags[0], ...resolved.map((t) => t.id)])];
  const musicBaseline = await probe("London music-category baseline", () => q.places({ at, radiusM, tags: venueTags, take: 20 }));
  const briefs: { artist: QEntity; candidates: QEntity[]; baselineOverlap: number; artistTags: unknown[] }[] = [];
  for (const name of ["Ghetts", "Nilufer Yanya", "Yaeji"]) {
    const found = await probe(`${name}: artist search`, () => q.search(name, { types: ["urn:entity:artist"], take: 3 }));
    const normalized = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const artist = found.find((e) => normalized(e.name) === normalized(name));
    if (!artist) { measurements.push({ probe: `${name}: exact resolution`, status: "unresolved; no substitute used" }); continue; }
    const artistTags = await probe(`${name}: taste tags`, () => q.tagAffinities({ signalEntities: [artist.id], take: 15 }));
    const candidates = await probe(`${name}: London music places`, () => q.places({ at, radiusM, tags: venueTags, signalEntities: [artist.id], take: 20 }));
    measurements[measurements.length - 1].affinityCount = candidates.filter((e) => e.affinity !== undefined).length;
    const ids = new Set(musicBaseline.slice(0, 3).map((e) => e.id));
    briefs.push({ artist, candidates, baselineOverlap: candidates.slice(0, 3).filter((e) => ids.has(e.id)).length, artistTags });
  }
  const anchor = briefs[0]?.artist;
  let restaurantTag: string | undefined;
  if (anchor) {
    const diningTags = await probe("restaurant tag resolution", () => q.searchTags({ query: "restaurant", take: 10 }));
    const restaurant = diningTags.find((t) => t.id === "urn:tag:genre:place:restaurant");
    restaurantTag = restaurant?.id;
    if (restaurant) await probe("artist to London restaurants", () => q.places({ at, radiusM, tags: [restaurant.id], signalEntities: [anchor.id], take: 10 }));
    await probe("artist to brands (spike keyword adapter)", () => recommendBrands(anchor.id));
    await probe("artist local heatmap", () => q.heatmap({ at, radiusM, signalEntities: [anchor.id] }));
  }
  const brands = await probe("Uniqlo brand search", () => q.search("Uniqlo", { types: ["urn:entity:brand"], take: 3 }));
  const brand = brands.find((e) => e.name.toLowerCase() === "uniqlo");
  if (brand) {
    await probe("brand to London places", () => q.places({ at, radiusM, signalEntities: [brand.id], take: 10 }));
    await probe("brand to brand (spike keyword adapter)", () => recommendBrands(brand.id));
    await probe("brand taste tags", () => q.tagAffinities({ signalEntities: [brand.id], take: 15 }));
    await probe("brand local heatmap", () => q.heatmap({ at, radiusM, signalEntities: [brand.id] }));
    if (restaurantTag) {
      await probe("London restaurants no-signal control", () => q.places({ at, radiusM, tags: [restaurantTag!], take: 10 }));
      await probe("brand to London restaurants matched control", () => q.places({ at, radiusM, tags: [restaurantTag!], signalEntities: [brand.id], take: 10 }));
    }
  }
  const dir = ".cache/spikes/product-direction";
  await mkdir(dir, { recursive: true });
  await writeFile(`${dir}/private-results.json`, JSON.stringify({ local, briefs, baseline, musicBaseline }, null, 2));
  const lines = ["# Local scouting evidence spike", "", "Private local Qloo-derived report. Do not commit or publish. No practitioner validation.", "", "Scope: central London, 5 km radius, current Qloo catalogue. No availability, costs, real capacity or turnout verification.", "", "## Measurement summary", "", ...measurements.map((m) => `- ${m.probe}: ${m.status}; count=${m.count ?? "n/a"}${m.affinityCount !== undefined ? `; affinity fields=${m.affinityCount}` : ""}`)];
  for (const brief of briefs) {
    lines.push("", `## ${brief.artist.name}: three candidates to investigate`, "", `Top-three overlap with unconditioned music-category baseline: ${brief.baselineOverlap}/3. This is a coverage/ranking probe, not a usefulness score.`, "");
    for (const [i, candidate] of brief.candidates.slice(0, 3).entries()) {
      lines.push(`### ${i + 1}. ${candidate.name}`, "", `- Direct evidence: Qloo place affinity for this artist signal = ${candidate.affinity ?? "not provided"}. Not ticket probability.`, `- Location: ${candidate.place?.address ?? "address unavailable"}; ${candidate.location ? "coordinates present" : "coordinates absent"}.`, `- Place tags: ${candidate.tags.slice(0, 6).map((t) => t.name).join(", ") || "unavailable"}.`, `- Live-music field: ${candidate.place?.liveMusic === undefined ? "unknown" : String(candidate.place.liveMusic)}; closure flag: ${candidate.place?.isClosed === undefined ? "unknown" : String(candidate.place.isClosed)}.`, "- Verification required: whether this place accepts this performance format, venue hire cost, genuine room capacity, dates, technical specification, accessibility and booking contact.", "- Recommendation: investigate only; no claim of feasibility or stronger demand than another venue.", "");
    }
  }
  await writeFile(`${dir}/scouting-briefs.md`, lines.join("\n") + "\n");
  const summary = { measurements, networkStarts: starts, ...transport.stats(), report: `${dir}/scouting-briefs.md` };
  await writeFile(`${dir}/summary.json`, JSON.stringify(summary, null, 2));
  console.log(JSON.stringify(summary, null, 2));
}

main().catch(() => { console.error("Spike stopped; check configuration, network or the request budget. No credentials logged."); process.exitCode = 1; });
