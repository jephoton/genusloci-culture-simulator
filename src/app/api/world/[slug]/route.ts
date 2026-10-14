import { CITIES } from "@/geo/cities";
import { loadWorldJson } from "@/world/store";

/**
 * Serves a city's Qloo World: built locally by `pnpm build:world <city>` or uploaded to the private
 * Blob store by `pnpm upload:worlds`. World files hold Qloo data, so they're only served by the app,
 * never committed (Qloo terms). 404 when the city is unknown or not built; the client then falls
 * back to a synthetic population.
 */
export async function GET(_req: Request, ctx: RouteContext<"/api/world/[slug]">) {
  const { slug } = await ctx.params;
  if (!Object.hasOwn(CITIES, slug)) return Response.json({ error: `Unknown city "${slug}"` }, { status: 404 });
  const json = await loadWorldJson(slug);
  if (!json) return Response.json({ error: `No Qloo world built for "${slug}"` }, { status: 404 });
  return new Response(json, { headers: { "Content-Type": "application/json", "Cache-Control": "private, max-age=300" } });
}
