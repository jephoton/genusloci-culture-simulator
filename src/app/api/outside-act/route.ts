import { z } from "zod";
import { liveQlooClient } from "@/agents/qloo-live";
import { clientKey, createRateLimiter } from "@/agents/rate-limit";
import { CITIES } from "@/geo/cities";
import type { QEntity, QTag } from "@/qloo/schemas";
import { isInvalidSignal, QlooBudgetError } from "@/qloo/transport";

export const maxDuration = 30;

/** Each new artist costs up to 3 Qloo calls (cached after): 6 lookups in a burst, then 2 a minute. */
const limiter = createRateLimiter(6, 2);
const BodySchema = z.object({ city: z.string().min(1).max(40), name: z.string().trim().min(1).max(80) });

/**
 * Describes an artist the city doesn't know in the city's own terms, using live Qloo calls: who the
 * artist is, which artists their fans like, and which tastes they share. Stable Qloo IDs cross the
 * boundary; the browser matches them to its own world and then
 * simulates the act as an event with that taste profile.
 */
export async function POST(req: Request) {
  const q = liveQlooClient();
  if (!q) return Response.json({ error: "Qloo isn't configured on this server." }, { status: 503 });
  if (!limiter.take(clientKey(req))) return Response.json({ error: "Too many artist lookups. Try again in a minute." }, { status: 429 });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success || !Object.hasOwn(CITIES, parsed.data.city)) return Response.json({ error: "Bad request" }, { status: 400 });
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
    return Response.json({ evidence: { artist, similar, tags } });
  } catch (e) {
    if (e instanceof QlooBudgetError) return Response.json({ error: "Live Qloo lookups are paused for this month." }, { status: 503 });
    console.error("[outside-act]", e);
    return Response.json({ error: "The Qloo lookup failed. Try again in a moment." }, { status: 502 });
  }
}
