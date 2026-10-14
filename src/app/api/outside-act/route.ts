import { z } from "zod";
import { matchOutsideAct } from "@/agents/outside-act";
import { liveQlooClient } from "@/agents/qloo-live";
import { clientKey, createRateLimiter } from "@/agents/rate-limit";
import { CITIES } from "@/geo/cities";
import type { QEntity, QTag } from "@/qloo/schemas";
import { isInvalidSignal, QlooBudgetError } from "@/qloo/transport";
import { parseWorld, type World } from "@/world/schema";
import { loadWorldJson } from "@/world/store";

export const maxDuration = 30;

/** Each new artist costs up to 3 Qloo calls (cached after): 6 lookups in a burst, then 2 a minute. */
const limiter = createRateLimiter(6, 2);
const BodySchema = z.object({ city: z.string().min(1).max(40), name: z.string().trim().min(1).max(80) });
const worlds = new Map<string, World>();

async function worldFor(slug: string): Promise<World | null> {
  const hit = worlds.get(slug);
  if (hit) return hit;
  const json = await loadWorldJson(slug);
  if (!json) return null;
  const w = parseWorld(JSON.parse(json));
  worlds.set(slug, w);
  return w;
}

/**
 * Describes an artist the city doesn't know in the city's own terms, using live Qloo calls: who the
 * artist is, which in-city artists their fans like, and which tastes they share. The browser then
 * simulates the act as an event with that taste profile.
 */
export async function POST(req: Request) {
  const q = liveQlooClient();
  if (!q) return Response.json({ error: "Qloo isn't configured on this server." }, { status: 503 });
  if (!limiter.take(clientKey(req))) return Response.json({ error: "Too many artist lookups. Try again in a minute." }, { status: 429 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !Object.hasOwn(CITIES, parsed.data.city)) return Response.json({ error: "Bad request" }, { status: 400 });
  const world = await worldFor(parsed.data.city);
  if (!world) return Response.json({ error: "This city isn't built with Qloo data yet." }, { status: 404 });
  try {
    const [artist] = await q.search(parsed.data.name, { types: ["urn:entity:artist"], take: 1 });
    if (!artist) return Response.json({ error: `Qloo doesn't know an artist called "${parsed.data.name}".` }, { status: 404 });
    const soft = async <T>(f: () => Promise<T[]>): Promise<T[]> => {
      try {
        return await f();
      } catch (e) {
        if (isInvalidSignal(e)) return [];
        throw e;
      }
    };
    const [similar, tags] = await Promise.all([
      soft<QEntity>(() => q.recommend("urn:entity:artist", { signalEntities: [artist.id], take: 30 })),
      soft<QTag>(() => q.tagAffinities({ signalEntities: [artist.id], take: 30 })),
    ]);
    const act = matchOutsideAct(world, artist, similar, tags);
    if (!act) return Response.json({ error: `Qloo couldn't connect ${artist.name} to this city's tastes.` }, { status: 404 });
    return Response.json({ act });
  } catch (e) {
    if (e instanceof QlooBudgetError) return Response.json({ error: "Live Qloo lookups are paused for this month." }, { status: 503 });
    console.error("[outside-act]", e);
    return Response.json({ error: "The Qloo lookup failed. Try again in a moment." }, { status: 502 });
  }
}
