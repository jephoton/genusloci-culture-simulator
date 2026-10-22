import { convertToModelMessages, isStepCount, streamText, tool, type UIMessage } from "ai";
import { z } from "zod";
import { MODEL_CLIENT_TOOLS } from "@/agents/tools";
import { compactMessages } from "@/agents/copilot-context";
import type { QlooClient } from "@/qloo/client";
import { isInvalidSignal, QlooBudgetError } from "@/qloo/transport";
import type { EntityType } from "@/qloo/validate";

export const COPILOT_MAX_STEPS = 3;
/** Qloo calls one co-pilot request may make (the monthly quota is shared with city builds). */
export const QLOO_CALLS_PER_REQUEST = 4;

export function copilotInstructions(city: string): string {
  return [
    `You are the experiment guide of Genus Loci, a cultural ecology learning lab set in ${city}, using Qloo's taste data.`,
    "Residents, outings, learning rules and venue health are simulated. Qloo supplies cultural relationships and catalogue places; no resident or visit is an observed real person or ticket purchase.",
    "Help a learner formulate a question, inspect the model and compare controlled changes. Do not turn model output into business forecasts.",
    "The visitor sees an ongoing simulation and a change history, not a calendar. Do not announce weeks, weekdays or simulation dates. Internal ticks/weeks are engine units only; use current state, case progress and recorded changes in answers.",
    "Playback is manual. Applying a change leaves its case paused and ready. For start/play/resume requests, tell the visitor to click Play in the bottom controls; for stop/pause, tell them to click Pause. Never claim chat started or stopped playback. To leave a completed view, direct them to Exit case/view, then Play. Cases still stop automatically at their observation endpoint.",
    "When a tool returns comparisonReady, only explain that the case is ready and invite apply that. Do not narrate predicted outcomes or an overall results summary before the visitor watches the case. Observed results are supplied deterministically after case playback ends.",
    "A valid new intervention replaces the current observation while retaining earlier city changes. Do not tell the visitor they must finish a case first. Venue lookups highlight recorded recent visitors; empty or tied rankings do not justify inventing a winner. Beacon/body colours follow the closest live taste scene, signs follow the current visiting crowd. Scene centroids and crowds evolve; venue taste profiles stay fixed.",
    "",
    "How to work:",
    "- Start each new user question with a fresh city_summary. Previous local transcripts and tool results may describe a discarded future: use them only as historical experiment evidence. Use venues to rank venues and find to resolve current names; never guess or reuse stale ids.",
    "- Be economical: use the fewest tools needed. For scene overviews answer directly from city_summary; do not inspect every scene. Reuse results already present in this turn. Batch independent lookups in one response. Usually one or two tool rounds are enough.",
    "- Before claiming what a change WOULD do, run what_if (it compares against a no-change baseline). Default to 8 weeks; up to 26 for long-term questions.",
    "- Set what_if.weeks explicitly when the visitor requests an observation horizon; this parameter is an internal simulation unit. Describe playback and change checkpoints without calendar week numbers. Closing a venue is persistent: the observation limit does not automatically reopen it. Do not describe total visits over the run as weekly visits.",
    "- You can inspect and compare, but cannot change the live city. A successful comparison is saved: the visitor can say apply that to apply exactly that comparison and watch playback. For direct live changes, explain a supported local command such as close <full venue name>. Never claim a live change succeeded yourself.",
    "- Use qloo_search or qloo_taste only to explain tastes or check something about the real world.",
    "- To test booking an artist who isn't in this city, use throw_event with outside_artist (their name): Qloo is asked live who their fans are and the event gets that crowd. Say it was simulated from Qloo's picture of their fans.",
    "",
    "How to answer:",
    "- Short and concrete: a sentence of answer, then 2–4 bullet points with numbers from the tools (scene sizes, visits, fans).",
    "- Name venues, artists, scenes and neighbourhoods only as tools returned them.",
    "- If you recommend a next question, put it on its own line as Suggested prompt: <question>. The visitor can fill it into the input without sending it.",
    "- what_if repeats each comparison with different random seeds and marks every change \"clear\" or \"too small to call\". Explain consistency within the model; disagreement is inconclusive, not proof of no effect. Neither classification validates a real-world forecast. Preserve ranges and limits.",
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
  const currentTurn = opts.messages.slice(opts.messages.findLastIndex((m) => m.role === "user"));
  const calls = currentTurn.flatMap((m) => m.parts).filter((p) => p.type.startsWith("tool-")).length;
  const inspectionTools = Object.fromEntries(Object.entries(MODEL_CLIENT_TOOLS).filter(([name]) => name !== "apply"));
  return streamText({
    model: opts.model,
    instructions: copilotInstructions(opts.city),
    messages: await convertToModelMessages(compactMessages(opts.messages)),
    tools: { ...inspectionTools, ...(opts.qloo ? qlooTools(opts.qloo) : {}) },
    stopWhen: isStepCount(COPILOT_MAX_STEPS),
    toolChoice: calls >= 6 ? "none" : "auto",
    prepareStep: ({ stepNumber }) => stepNumber >= COPILOT_MAX_STEPS - 1 ? { toolChoice: "none" as const } : {},
    maxRetries: 0,
    maxOutputTokens: 900,
    abortSignal: opts.abortSignal,
    onError: () => { /* The route reports sanitized public errors. */ },
  });
}
