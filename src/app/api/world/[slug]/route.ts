import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CITIES } from "@/geo/cities";

/**
 * Serves a city's Qloo World built by `pnpm build:world <city>`. World files hold Qloo data, so they
 * live in the git-ignored .cache/worlds and are only served by the app, never committed (Qloo terms).
 * 404 when the city is unknown or not built; the client then falls back to a synthetic population.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/world/[slug]">) {
  const { slug } = await ctx.params;
  if (!Object.hasOwn(CITIES, slug)) return Response.json({ error: `Unknown city "${slug}"` }, { status: 404 });
  try {
    const json = await readFile(join(process.cwd(), ".cache", "worlds", `${slug}.world.json`), "utf8");
    return new Response(json, { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" } });
  } catch {
    return Response.json({ error: `No Qloo world built for "${slug}"` }, { status: 404 });
  }
}
