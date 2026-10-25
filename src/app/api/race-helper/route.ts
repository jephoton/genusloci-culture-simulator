import { createUIMessageStreamResponse, toUIMessageStream, type UIMessage } from "ai";
import { modelFor } from "@/agents/providers";
import { liveQlooClient } from "@/agents/qloo-live";
import { RaceHelperBodySchema, raceHelperStream } from "@/agents/race-helper";
import { clientKey, createRateLimiter } from "@/agents/rate-limit";
import { agentStreamError, providerRetrySeconds } from "@/agents/stream-error";

export const maxDuration = 60;

/** 10 questions in a burst, then 4 a minute, per visitor. */
const limiter = createRateLimiter(10, 4);
let providerCooldownUntil = 0;

/** Answers questions about the visitor's current venue race (the race itself runs in the browser). */
export async function POST(req: Request) {
  const remaining = Math.ceil((providerCooldownUntil - Date.now()) / 1000);
  if (remaining > 0) return Response.json({ error: "The language-model provider is cooling down. Please wait before asking again.", retryAfter: remaining }, { status: 429, headers: { "Retry-After": String(remaining), "Cache-Control": "no-store" } });
  const model = modelFor("copilot");
  if (!model) return Response.json({ error: "The guide is offline (no language model configured). The race itself still works." }, { status: 503 });
  if (!limiter.take(clientKey(req))) return Response.json({ error: "Too many questions at once. Try again in a minute.", retryAfter: 60 }, { status: 429, headers: { "Retry-After": "60" } });
  const parsed = RaceHelperBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const result = await raceHelperStream({
    model,
    messages: parsed.data.messages as unknown as UIMessage[],
    city: parsed.data.city,
    context: parsed.data.context,
    qloo: liveQlooClient(),
    abortSignal: req.signal,
  });
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (e) => {
        const seconds = providerRetrySeconds(e);
        if (seconds !== null) providerCooldownUntil = Math.max(providerCooldownUntil, Date.now() + seconds * 1000);
        return agentStreamError(e);
      },
    }),
  });
}
