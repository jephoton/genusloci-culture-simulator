import { createUIMessageStreamResponse, toUIMessageStream, type UIMessage } from "ai";
import { CopilotBodySchema, copilotStream } from "@/agents/copilot";
import { modelFor } from "@/agents/providers";
import { liveQlooClient } from "@/agents/qloo-live";
import { clientKey, createRateLimiter } from "@/agents/rate-limit";

export const maxDuration = 60;

/** 10 questions in a burst, then 4 a minute, per visitor. */
const limiter = createRateLimiter(10, 4);

export async function POST(req: Request) {
  const model = modelFor("copilot");
  if (!model) return Response.json({ error: "The co-pilot is offline (no LLM key configured). The toolbar still works." }, { status: 503 });
  if (!limiter.take(clientKey(req))) return Response.json({ error: "Too many questions at once. Try again in a minute." }, { status: 429 });
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
        console.error("[copilot]", e);
        return "The co-pilot hit a problem talking to the language model. Try again in a moment.";
      },
    }),
  });
}
