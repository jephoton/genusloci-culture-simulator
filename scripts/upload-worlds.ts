import { existsSync, readFileSync } from "node:fs";
import { put } from "@vercel/blob";
import { CITIES } from "@/geo/cities";
import { parseWorld } from "@/world/schema";
import { worldBlobPath } from "@/world/store";

// Usage: pnpm upload:worlds [city…]   (default: every city with a built world in .cache/worlds)
// Uploads built worlds to the project's PRIVATE Vercel Blob store, where /api/world reads them in
// production. Needs BLOB_READ_WRITE_TOKEN (in .env.local, e.g. from `vercel env pull`).
// Private access only: world files hold Qloo data and must not be publicly downloadable.

try {
  process.loadEnvFile(".env.local");
} catch {
  // fall back to the real environment
}

async function main() {
  if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error("BLOB_READ_WRITE_TOKEN is not set (run `vercel env pull .env.local` after linking a Blob store)");
  const asked = process.argv.slice(2);
  const slugs = asked.length > 0 ? asked : Object.keys(CITIES).filter((s) => existsSync(`.cache/worlds/${s}.world.json`));
  if (slugs.length === 0) throw new Error("No built worlds in .cache/worlds (run pnpm build:world <city> first)");
  for (const slug of slugs) {
    if (!Object.hasOwn(CITIES, slug)) throw new Error(`Unknown city "${slug}"`);
    const json = readFileSync(`.cache/worlds/${slug}.world.json`, "utf8");
    parseWorld(JSON.parse(json));
    await put(worldBlobPath(slug), json, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
    console.log(`Uploaded ${slug} (${(json.length / 1024).toFixed(0)} KB) as private ${worldBlobPath(slug)}`);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
