import { convertToModelMessages, isStepCount, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { CLIENT_TOOLS } from "@/agents/tools";
import type { QlooClient } from "@/qloo/client";
import { isInvalidSignal, QlooBudgetError } from "@/qloo/transport";
import type { EntityType } from "@/qloo/validate";

export const COPILOT_MAX_STEPS = 8;
/** Qloo calls one co-pilot request may make (the monthly quota is shared with city builds). */
export const QLOO_CALLS_PER_REQUEST = 4;

export function copilotInstructions(city: string): string {
  return [
    `You are the co-pilot of Genus Loci, a living simulation of ${city}'s culture built from Qloo's taste data.`,
    "Residents carry real tastes (Qloo place tags and artists), go out to real venues, influence each other, and form scenes that grow, split and die. Venues thrive or close depending on who comes.",
    "The user is a venue owner, promoter or city culture planner. Help them understand the city and test decisions.",
    "",
    "How to work:",
    "- Start with city_summary unless you already have it. Use venues to rank venues (busiest, struggling, by kind or area) and find to turn names into ids; never guess ids.",
    "- Be economical: a typical question needs 2–5 tool calls.",
    "- Before claiming what a change WOULD do, run what_if (it compares against a no-change baseline). Default to 8 weeks; up to 26 for long-term questions.",
    "- Only use apply when the user clearly asks you to make the change in the live city.",
    "- Use qloo_search or qloo_taste only to explain tastes or check something about the real world; the simulation only contains this city's entities.",
    "",
    "How to answer:",
    "- Short and concrete: a sentence of answer, then 2–4 bullet points with numbers from the tools (scene sizes, visits, fans).",
    "- Name venues, artists, scenes and neighbourhoods only as tools returned them.",
    "- what_if repeats each comparison with different random seeds and marks every change \"clear\" or \"too small to call\". Lead with clear effects; call the rest noise. Mention ranges when they matter. Say what the simulation can't capture.",
    "- Never mention tool names, ids or JSON to the user.",
  ].join("\n");
}

/** Server-side Qloo tools with a per-request call cap; failures come back as messages, not errors. */
export function qlooTools(q: QlooClient) {
  let calls = 0;
  const guard = async <T>(f: () => Promise<T>): Promise<T | { error: string }> => {
    if (calls >= QLOO_CALLS_PER_REQUEST) return { error: "Qloo lookup limit reached for this question; answer with what you have." };
    calls++;
    try {
      return await f();
    } catch (e) {
      if (e instanceof QlooBudgetError) return { error: "Qloo lookups are paused (monthly quota); answer from the simulation." };
      if (isInvalidSignal(e)) return { error: "Qloo has no taste data for that entity." };
      return { error: `Qloo lookup failed: ${e instanceof Error ? e.message : String(e)}` };
    }
  };
  const types = ["artist", "place", "brand", "movie", "book", "tv_show", "podcast", "video_game", "destination", "person"] as const;
  return {
    qloo_search: tool({
      description: "Look an entity up in Qloo's catalogue by name (anywhere in the world, not just this city).",
      inputSchema: z.object({ name: z.string().min(1), type: z.enum(types).optional() }),
      execute: ({ name, type }) =>
        guard(async () => {
          const found = await q.search(name, { types: type ? [`urn:entity:${type}` as EntityType] : undefined, take: 5 });
          return found.map((e) => ({ name: e.name, type: e.type?.replace("urn:entity:", ""), popularity: e.popularity && Math.round(e.popularity * 100) / 100, description: e.description?.slice(0, 160) }));
        }),
    }),
    qloo_taste: tool({
      description: "What a taste means according to Qloo: the tags most associated with fans of an entity (looked up by name).",
      inputSchema: z.object({ name: z.string().min(1), type: z.enum(types).optional() }),
      execute: ({ name, type }) =>
        guard(async () => {
          const [hit] = await q.search(name, { types: type ? [`urn:entity:${type}` as EntityType] : undefined, take: 1 });
          if (!hit) return { error: `Qloo found nothing called "${name}".` };
          if (calls >= QLOO_CALLS_PER_REQUEST) return { entity: hit.name, tags: [] };
          calls++;
          const tags = await q.tagAffinities({ signalEntities: [hit.id], take: 12 });
          return { entity: hit.name, tags: tags.map((t) => t.name) };
        }),
    }),
  };
}

export const CopilotBodySchema = z.object({
  messages: z.array(z.looseObject({ id: z.string(), role: z.enum(["user", "assistant", "system"]), parts: z.array(z.unknown()) })).min(1).max(60),
  city: z.string().min(1).max(60),
});

/** The co-pilot's streamed turn: city tools run in the browser, Qloo tools on the server. */
export async function copilotStream(opts: {
  model: Parameters<typeof streamText>[0]["model"];
  messages: UIMessage[];
  city: string;
  qloo: QlooClient | null;
  abortSignal?: AbortSignal;
}) {
  return streamText({
    model: opts.model,
    instructions: copilotInstructions(opts.city),
    messages: await convertToModelMessages(opts.messages),
    tools: { ...CLIENT_TOOLS, ...(opts.qloo ? qlooTools(opts.qloo) : {}) },
    stopWhen: isStepCount(COPILOT_MAX_STEPS),
    maxRetries: 0,
    maxOutputTokens: 1500,
    abortSignal: opts.abortSignal,
  });
}
