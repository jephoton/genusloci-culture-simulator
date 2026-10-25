import { z } from "zod";
import { modelFor } from "@/agents/providers";
import { liveQlooClient } from "@/agents/qloo-live";
import { RaceContextSchema } from "@/agents/race-helper";
import { clientKey, createRateLimiter } from "@/agents/rate-limit";
import { agentStreamError, providerRetrySeconds } from "@/agents/stream-error";
import { explainRace, PickBodySchema, pickVenues } from "@/agents/venue-agent";

export const maxDuration = 60;

/** 10 agent runs in a burst, then 4 a minute, per visitor. */
const limiter = createRateLimiter(10, 4);
let providerCooldownUntil = 0;

const BodySchema = z.discriminatedUnion("mode", [
  PickBodySchema.extend({ mode: z.literal("pick") }),
  z.object({ mode: z.literal("explain"), city: z.string().min(1).max(60), context: RaceContextSchema }),
]);

/** The race's agent: picks the venues to race, and explains a finished race. */
export async function POST(req: Request) {
  const remaining = Math.ceil((providerCooldownUntil - Date.now()) / 1000);
  if (remaining > 0) return Response.json({ error: "The agent's language model is cooling down.", retryAfter: remaining }, { status: 429, headers: { "Retry-After": String(remaining) } });
  const model = modelFor("copilot");
  if (!model) return Response.json({ error: "The agent is offline (no language model configured)." }, { status: 503 });
  if (!limiter.take(clientKey(req))) return Response.json({ error: "Too many agent runs at once. Try again in a minute.", retryAfter: 60 }, { status: 429, headers: { "Retry-After": "60" } });
  const parsed = BodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const qloo = liveQlooClient();
  try {
    if (parsed.data.mode === "pick") return Response.json(await pickVenues({ model, body: parsed.data, qloo, abortSignal: req.signal }));
    return Response.json({ text: await explainRace({ model, city: parsed.data.city, context: parsed.data.context, qloo, abortSignal: req.signal }) });
  } catch (e) {
    const seconds = providerRetrySeconds(e);
    if (seconds !== null) providerCooldownUntil = Math.max(providerCooldownUntil, Date.now() + seconds * 1000);
    return Response.json({ error: agentStreamError(e) }, { status: 502 });
  }
}
