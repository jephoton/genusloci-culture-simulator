import { NameScenesBodySchema, nameScenes } from "@/agents/naming";
import { modelFor } from "@/agents/providers";
import { clientKey, createRateLimiter } from "@/agents/rate-limit";

export const maxDuration = 30;

/** Naming runs automatically as scenes appear: a generous burst, then 6 calls a minute per visitor. */
const limiter = createRateLimiter(12, 6);

export async function POST(req: Request) {
  const model = modelFor("small");
  if (!model) return Response.json({ error: "Scene naming is offline (no LLM key configured)." }, { status: 503 });
  if (!limiter.take(clientKey(req))) return Response.json({ error: "Too many naming requests." }, { status: 429 });
  const parsed = NameScenesBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Bad request" }, { status: 400 });
  try {
    return Response.json({ names: await nameScenes(model, parsed.data) });
  } catch (e) {
    console.error("[name-scenes]", e);
    return Response.json({ error: "Naming failed" }, { status: 502 });
  }
}
