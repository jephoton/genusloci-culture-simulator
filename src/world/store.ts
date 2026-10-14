import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { get } from "@vercel/blob";

// Where built Qloo worlds live. They hold Qloo data, so never in git (Qloo terms):
// - locally: .cache/worlds/<slug>.world.json, written by `pnpm build:world <slug>`;
// - deployed: a private Vercel Blob store (`pnpm upload:worlds`), read with BLOB_READ_WRITE_TOKEN.

export const worldBlobPath = (slug: string) => `worlds/${slug}.world.json`;

/** Per server instance: worlds don't change between uploads, so keep what was read. */
const memo = new Map<string, string>();

async function readLocal(slug: string): Promise<string | null> {
  try {
    return await readFile(join(process.cwd(), ".cache", "worlds", `${slug}.world.json`), "utf8");
  } catch {
    return null;
  }
}

async function readBlob(slug: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  try {
    const result = await get(worldBlobPath(slug), { access: "private" });
    if (!result || result.statusCode !== 200 || !result.stream) return null;
    return await new Response(result.stream).text();
  } catch (e) {
    console.error(`[world] couldn't read ${slug} from Blob:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/** The built world's JSON for a city, or null if it hasn't been built (or uploaded). */
export async function loadWorldJson(slug: string): Promise<string | null> {
  const hit = memo.get(slug);
  if (hit) return hit;
  const json = (await readLocal(slug)) ?? (await readBlob(slug));
  if (json) memo.set(slug, json);
  return json;
}
