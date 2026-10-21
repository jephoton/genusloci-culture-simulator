import { createUIMessageStreamResponse, toUIMessageStream, type UIMessage } from "ai";
import { CopilotBodySchema, copilotStream } from "@/agents/copilot";
import { modelFor, PROVIDERS } from "@/agents/providers";
import { liveQlooClient } from "@/agents/qloo-live";
import { clientKey, createRateLimiter } from "@/agents/rate-limit";
import { agentStreamError, providerRetrySeconds } from "@/agents/stream-error";

export const maxDuration = 60;

/** 10 questions in a burst, then 4 a minute, per visitor. */
const limiter = createRateLimiter(10, 4);
let providerCooldownUntil = 0;

/** Configuration only: no credentials, model construction or provider request. */
export async function GET() {
  return Response.json({ configured: PROVIDERS.some((p) => !!process.env[p.keyVar]?.trim()) }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const remaining = Math.ceil((providerCooldownUntil - Date.now()) / 1000);
  if (remaining > 0) return Response.json({ error: "The language-model provider is cooling down. Please wait before asking again.", retryAfter: remaining }, { status: 429, headers: { "Retry-After": String(remaining), "Cache-Control": "no-store" } });
  const model = modelFor("copilot");
  if (!model) return Response.json({ error: "The co-pilot is offline (no LLM key configured). The toolbar still works." }, { status: 503 });
  if (!limiter.take(clientKey(req))) return Response.json({ error: "Too many questions at once. Try again in a minute.", retryAfter: 60 }, { status: 429, headers: { "Retry-After": "60" } });
  const parsed = CopilotBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const result = await copilotStream({
    model,
    messages: parsed.data.messages as unknown as UIMessage[],
    city: parsed.data.city,
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
