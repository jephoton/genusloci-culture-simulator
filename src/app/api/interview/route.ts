import { createUIMessageStreamResponse, toUIMessageStream, type UIMessage } from "ai";
import { InterviewBodySchema, interviewStream } from "@/agents/interview";
import { modelFor } from "@/agents/providers";
import { clientKey, createRateLimiter } from "@/agents/rate-limit";

export const maxDuration = 30;

/** 15 lines in a burst, then 6 a minute, per visitor. */
const limiter = createRateLimiter(15, 6);

export async function POST(req: Request) {
  const model = modelFor("small");
  if (!model) return Response.json({ error: "Interviews are offline (no LLM key configured)." }, { status: 503 });
  if (!limiter.take(clientKey(req))) return Response.json({ error: "Slow down a little. Try again in a minute." }, { status: 429 });
  const parsed = InterviewBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  const result = await interviewStream({
    model,
    persona: parsed.data.persona,
    messages: parsed.data.messages as unknown as UIMessage[],
    abortSignal: req.signal,
  });
  return createUIMessageStreamResponse({
    stream: toUIMessageStream({
      stream: result.stream,
      onError: (e) => {
        console.error("[interview]", e);
        return "They didn't catch that. Try again in a moment.";
      },
    }),
  });
}
