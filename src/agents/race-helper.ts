import { convertToModelMessages, isStepCount, streamText, type UIMessage } from "ai";
import { z } from "zod";
import { qlooTools } from "@/agents/copilot";
import type { QlooClient } from "@/qloo/client";

/** What the visitor can see in the venue race, sent with each question (bounded, no ids). */
export const RaceContextSchema = z.object({
  step: z.enum(["artist", "venues", "race", "result"]),
  artist: z.string().max(80).optional(),
  artistNote: z.string().max(300).optional(),
  venues: z.array(z.object({
    letter: z.string().max(2),
    name: z.string().max(80),
    kind: z.string().max(40),
    area: z.string().max(80),
    qlooFit: z.number().min(0).max(100),
    regulars: z.number().int().min(0),
  })).max(3),
  race: z.object({
    firstNight: z.string().max(12),
    nights: z.number().int().min(1).max(7),
    nightsPlayed: z.number().int().min(0).max(7),
    visits: z.array(z.number().min(0)).max(3),
    result: z.object({
      winner: z.string().max(2).nullable(),
      futures: z.number().int().min(1).max(10),
      consistent: z.boolean(),
      rows: z.array(z.object({ letter: z.string().max(2), min: z.number(), max: z.number(), wins: z.number().int(), hostVisitsWithoutEvent: z.number(), hostVisitsWithEvent: z.number(), visitsLostByVenuesNearby: z.number() })).max(3),
    }).optional(),
  }).optional(),
});
export type RaceContext = z.infer<typeof RaceContextSchema>;

export const RaceHelperBodySchema = z.object({
  messages: z.array(z.looseObject({ id: z.string(), role: z.enum(["user", "assistant", "system"]), parts: z.array(z.unknown()) })).min(1).max(30),
  city: z.string().min(1).max(60),
  context: RaceContextSchema,
});

export function raceHelperInstructions(city: string, context: RaceContext): string {
  return [
    `You are the guide for Genus Loci's venue race in ${city}. The visitor picks an artist; Qloo's taste data shortlists up to three existing venues (A, B, C) whose crowds fit; then each venue hosts the artist in its own copy of the same simulated city, from the same moment and luck, night by night. The race the visitor watches is future 1; the result also checks two more futures with different luck.`,
    "What is real: venue names, kinds, taste tags and artist affinities (Qloo); streets (OpenStreetMap). What is simulated: the residents, their nights out and how tastes spread. Visits are by simulated residents, not ticket sales; never present them as a forecast for the real venue.",
    "How the model decides: an event draws residents who go out that night and live within 1.5 km of the venue, weighted by how well the artist matches their tastes, against the pull of nearby venues and friends. So location (who lives nearby and what they like) matters as much as Qloo fit. hostVisitsWithoutEvent is the venue's own visits over the same nights with no event; hostVisitsWithEvent includes the event's visits; visitsLostByVenuesNearby is visits other venues within 1 km lost. visits are totals over all the nights, not per night.",
    "Answer only from the context below and, if asked about real-world tastes, the Qloo tools. If the context lacks something (for example, the race hasn't run yet), say so and suggest the next step in the flow. Never invent numbers.",
    "Style: two to four short sentences or bullets, plain words, numbers from the context. Refer to venues by letter and name. No ids or JSON.",
    "",
    "Current race (JSON):",
    JSON.stringify(context),
  ].join("\n");
}

/** One streamed answer about the current race; Qloo lookups run on the server with a per-question cap. */
export async function raceHelperStream(opts: {
  model: Parameters<typeof streamText>[0]["model"];
  messages: UIMessage[];
  city: string;
  context: RaceContext;
  qloo: QlooClient | null;
  abortSignal?: AbortSignal;
}) {
  return streamText({
    model: opts.model,
    instructions: raceHelperInstructions(opts.city, opts.context),
    messages: await convertToModelMessages(opts.messages),
    tools: opts.qloo ? qlooTools(opts.qloo) : {},
    stopWhen: isStepCount(3),
    maxRetries: 0,
    maxOutputTokens: 600,
    abortSignal: opts.abortSignal,
    onError: () => { /* The route reports sanitized public errors. */ },
  });
}
