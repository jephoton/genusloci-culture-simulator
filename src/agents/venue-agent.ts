import { generateText, hasToolCall, isStepCount, tool } from "ai";
import { z } from "zod";
import { qlooTools } from "@/agents/copilot";
import { isInvalidSignal, QlooBudgetError } from "@/qloo/transport";
import { type RaceContext, raceHelperInstructions } from "@/agents/race-helper";
import type { QlooClient } from "@/qloo/client";

// The race's agent. It picks which three venues race from the city's venues the browser sends
// (ranked by the city's Qloo data, with fans nearby from the simulation), after checking the artist
// in Qloo, asking Qloo live which venues the artist's fans like when the city's data is thin, and
// reading venues' tags. It also explains the result. It never runs the simulation or invents numbers.

export const MAX_CANDIDATES = 150;
/** Venues listed in the agent's instructions; the rest are reachable through its tools. */
export const SHORTLIST = 8;
export const PICKS = 3;
/** Qloo place genres the race can host, so the live lookup skips landmarks, shops and restaurants. */
const VENUE_TAGS = ["urn:tag:genre:place:night_club", "urn:tag:genre:place:music_venue", "urn:tag:genre:place:bar"];

const CandidateSchema = z.object({
  id: z.string().regex(/^v\d{1,3}$/),
  /** Qloo entity id, to match live Qloo answers to the city's venues. */
  qid: z.string().max(64),
  name: z.string().min(1).max(80),
  kind: z.string().max(40),
  area: z.string().max(80),
  /** Qloo affinity in the city's data, relative to the best candidate, 0–100 (0: no link). */
  qlooFit: z.number().min(0).max(100),
  /** Taste-weighted simulated residents within an event's reach. */
  fansNearby: z.number().min(0),
  /** Residents who went there in the last simulated week. */
  regulars: z.number().int().min(0),
  /** Readable Qloo tags for the venue. */
  tags: z.array(z.string().max(60)).max(8),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const PickBodySchema = z.object({
  city: z.string().min(1).max(60),
  /** Where to ask Qloo about (the city's centre and radius). */
  near: z.object({ lat: z.number().min(-90).max(90), lon: z.number().min(-180).max(180), radiusM: z.number().min(100).max(20_000) }),
  artist: z.string().min(1).max(80),
  artistNote: z.string().max(300).optional(),
  /** The artist's Qloo tags from the city's data, if the city knows them. */
  artistTags: z.array(z.string().max(60)).max(20).optional(),
  /** The city's eligible venues, best first. */
  candidates: z.array(CandidateSchema).min(1).max(MAX_CANDIDATES),
});
export type PickBody = z.infer<typeof PickBodySchema>;

/** A chosen venue; `liveFit` is Qloo's live affinity (0–100) when the agent's live lookup returned it. */
export type Pick = { id: string; reason: string; liveFit?: number };
/** One thing the agent did, in plain words, for the panel. */
export type Step = { text: string };
/** `considered`: the venues the agent saw (live Qloo finds, then its shortlist), for swapping. */
export type PickResult = { picks: Pick[]; summary: string; steps: Step[]; considered: string[] };

/** "urn:tag:genre:music:uk_garage" → "uk garage". */
export const readableTag = (urn: string) => (urn.split(":").at(-1) ?? urn).replace(/_/g, " ");

export function pickInstructions(body: PickBody): string {
  return [
    `You are the scout for a venue race in ${body.city}. The visitor wants to book ${body.artist}. You choose ${Math.min(PICKS, body.candidates.length)} of the city's ${body.candidates.length} music venues, clubs and bars to race in a simulation of the city's residents. The best ${Math.min(SHORTLIST, body.candidates.length)} by the city's Qloo data are listed below.`,
    "Fields: qlooFit is Qloo affinity from the city's data (0 means the data links none, not that it's a bad fit). fansNearby is simulated residents within reach whose tastes lean towards the artist; it varies little, so use it to break ties. regulars is last week's simulated visitors.",
    "Work like a booker: first call artist_taste to learn the artist's genres and style. If fewer than three listed venues have a qlooFit above 0, call qloo_rank_venues to ask Qloo live which of the city's venues the artist's fans like. Then call inspect_venue on the venues worth a closer look, and call choose_venues once. You may choose any venue returned by a tool, not only the listed ones.",
    "Size: the simulation compares how many residents each venue would draw, not real capacity, and the city's data has no seat counts. If artist_taste gives a popularity of 0.95 or more, the artist normally plays arenas: say so plainly in the summary (this area's venues are far smaller, so the race compares their relative pull), and prefer music venues over small bars.",
    "Choose venues whose crowds plausibly share the artist's tastes. Prefer a mix that makes the race informative (for example a strong Qloo fit with few regulars against a weaker fit with many).",
    "Each reason is one plain sentence under 18 words that links the venue's crowd or ambience to the artist's style where the tags support it, or cites the Qloo fit or regulars. The summary is one sentence on how the three differ. Never invent numbers or tags.",
    body.artistNote ? `About the artist: ${body.artistNote}` : "",
    "",
    "Shortlist (JSON):",
    JSON.stringify(body.candidates.slice(0, SHORTLIST).map((c) => ({ id: c.id, name: c.name, kind: c.kind, area: c.area, qlooFit: c.qlooFit, fansNearby: Math.round(c.fansNearby), regulars: c.regulars }))),
  ].filter(Boolean).join("\n");
}

function tools(body: PickBody, qloo: QlooClient | null) {
  const byId = new Map(body.candidates.map((c) => [c.id, c]));
  return {
    artist_taste: tool({
      description: "The artist's genres and style according to Qloo.",
      inputSchema: z.object({}),
      execute: async () => {
        if (qloo) {
          try {
            const [hit] = await qloo.search(body.artist, { types: ["urn:entity:artist"], take: 1 });
            if (hit?.tags.length) return { artist: hit.name, popularity: hit.popularity === undefined ? undefined : Math.round(hit.popularity * 100) / 100, tags: hit.tags.slice(0, 15).map((t) => t.name) };
          } catch (e) {
            if (!(e instanceof QlooBudgetError) && !isInvalidSignal(e)) throw e;
          }
        }
        return body.artistTags?.length ? { artist: body.artist, tags: body.artistTags } : { error: "No taste data for this artist; use the Qloo fit." };
      },
    }),
    ...(qloo ? {
      qloo_rank_venues: tool({
        description: "Ask Qloo live which of the city's venues this artist's fans like most (beyond the city's stored data). Returns up to 8 of the city's venues with Qloo's live affinity, 0–100.",
        inputSchema: z.object({}),
        execute: async () => {
          try {
            const [artist] = await qloo.search(body.artist, { types: ["urn:entity:artist"], take: 1 });
            if (!artist) return { error: `Qloo doesn't know ${body.artist}.` };
            const places = await qloo.places({ at: { lat: body.near.lat, lon: body.near.lon }, radiusM: body.near.radiusM, signalEntities: [artist.id], tags: VENUE_TAGS, take: 50 });
            const byQid = new Map(body.candidates.map((c) => [c.qid, c]));
            const top = Math.max(1e-9, ...places.map((p) => p.affinity ?? 0));
            const hits = places.flatMap((p) => {
              const c = byQid.get(p.id);
              return c ? [{ id: c.id, name: c.name, kind: c.kind, area: c.area, liveQlooAffinity: Math.round((100 * (p.affinity ?? 0)) / top), fansNearby: Math.round(c.fansNearby), regulars: c.regulars }] : [];
            }).slice(0, 8);
            return hits.length ? { venues: hits } : { error: "Qloo's live answer matched none of the city's venues; use the listed ones." };
          } catch (e) {
            if (e instanceof QlooBudgetError || isInvalidSignal(e)) return { error: "Qloo can't answer that right now; use the listed venues." };
            throw e;
          }
        },
      }),
    } : {}),
    inspect_venue: tool({
      description: "A shortlisted venue's Qloo tags (its crowd and ambience), plus its Qloo fit and simulated regulars.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const c = byId.get(id);
        return c ? { name: c.name, kind: c.kind, area: c.area, qlooFit: c.qlooFit, fansNearby: Math.round(c.fansNearby), regulars: c.regulars, tags: c.tags } : { error: `No venue ${id} in this city.` };
      },
    }),
    choose_venues: tool({
      description: "Your final choice of venues to race, each with a one-sentence reason, and a one-sentence summary.",
      inputSchema: z.object({
        picks: z.array(z.object({ id: z.string(), reason: z.string() })).min(1).max(PICKS),
        summary: z.string(),
      }),
      execute: async () => ({ ok: true }),
    }),
  };
}

/** Plain-words trace of a tool call, for the panel. */
function describe(body: PickBody, name: string, input: unknown, output: unknown): string | null {
  const args = (input ?? {}) as { id?: string };
  const out = (output ?? {}) as { tags?: string[]; venues?: { name: string }[]; error?: string };
  if (name === "artist_taste") {
    if (out.error || !out.tags?.length) return `Looked up ${body.artist} in Qloo (no taste data)`;
    return `Looked up ${body.artist} in Qloo: ${out.tags.slice(0, 4).map(readableTag).join(", ")}`;
  }
  if (name === "qloo_rank_venues") {
    if (out.error || !out.venues?.length) return `Asked Qloo live which venues ${possessive(body.artist)} fans like (no match in this city)`;
    return `Asked Qloo live which venues ${possessive(body.artist)} fans like: ${out.venues.slice(0, 4).map((v) => v.name).join(", ")}`;
  }
  if (name === "inspect_venue") {
    const c = body.candidates.find((v) => v.id === args.id);
    return c ? `Checked ${possessive(c.name)} Qloo tags: ${c.tags.slice(0, 3).join(", ") || "none"}` : null;
  }
  return null;
}

/** "Ku Bar" → "Ku Bar's", "Quaglino's" → "Quaglino's" (not "Quaglino's's"). */
export const possessive = (name: string) => (/'s$|s$/i.test(name) ? (name.endsWith("'s") ? name : `${name}'`) : `${name}'s`);

const clean = (s: string, max: number) => s.replace(/\s+/g, " ").trim().slice(0, max);

/** The best-fit venues, used when the agent is offline or its choice is incomplete. */
export function fallbackPicks(body: PickBody, taken: Pick[] = []): Pick[] {
  const out = [...taken];
  for (const c of body.candidates) {
    if (out.length >= Math.min(PICKS, body.candidates.length)) break;
    if (!out.some((p) => p.id === c.id)) out.push({ id: c.id, reason: c.qlooFit > 0 ? `Qloo fit ${Math.round(c.qlooFit)}, with ${c.regulars} regulars this week.` : `About ${Math.round(c.fansNearby)} fans nearby in the simulation, with ${c.regulars} regulars this week.` });
  }
  return out;
}

export async function pickVenues(opts: {
  model: Parameters<typeof generateText>[0]["model"];
  body: PickBody;
  qloo: QlooClient | null;
  abortSignal?: AbortSignal;
}): Promise<PickResult> {
  const { body } = opts;
  const result = await generateText({
    model: opts.model,
    instructions: pickInstructions(body),
    prompt: `Pick the venues to race for ${body.artist}.`,
    tools: tools(body, opts.qloo),
    stopWhen: [hasToolCall("choose_venues"), isStepCount(6)],
    maxRetries: 0,
    maxOutputTokens: 900,
    abortSignal: opts.abortSignal,
  });
  const steps: Step[] = [];
  let choice: { picks: Pick[]; summary: string } | null = null;
  const live = new Map<string, number>();
  for (const step of result.steps) {
    for (const r of step.toolResults) {
      if (!r) continue;
      if (r.toolName === "choose_venues") choice = r.input as { picks: Pick[]; summary: string };
      else {
        if (r.toolName === "qloo_rank_venues") for (const v of (r.output as { venues?: { id: string; liveQlooAffinity: number }[] }).venues ?? []) live.set(v.id, v.liveQlooAffinity);
        const text = describe(body, r.toolName, r.input, r.output);
        if (text) steps.push({ text });
      }
    }
  }
  const ids = new Set(body.candidates.map((c) => c.id));
  const valid: Pick[] = [];
  for (const p of choice?.picks ?? []) {
    if (ids.has(p.id) && !valid.some((v) => v.id === p.id) && p.reason.trim()) valid.push({ id: p.id, reason: clean(p.reason, 160), ...(live.has(p.id) ? { liveFit: live.get(p.id) } : {}) });
  }
  const picks = fallbackPicks(body, valid);
  if (valid.length < picks.length) steps.push({ text: valid.length ? "Filled the rest with the next best matches" : "Didn't settle on venues, so took the best matches" });
  // Live Qloo finds first: the agent only asks when the city's stored links are thin.
  const considered = [...new Set([...live.keys(), ...body.candidates.slice(0, SHORTLIST).map((c) => c.id)])];
  return { picks, summary: clean(choice?.summary ?? "", 260), steps, considered };
}

/** A short explanation of a finished race, from its numbers (and Qloo, if asked). */
export async function explainRace(opts: {
  model: Parameters<typeof generateText>[0]["model"];
  city: string;
  context: RaceContext;
  qloo: QlooClient | null;
  abortSignal?: AbortSignal;
}): Promise<string> {
  const result = await generateText({
    model: opts.model,
    instructions: raceHelperInstructions(opts.city, opts.context),
    prompt: "In at most two short sentences (under 50 words), explain why the result came out this way. Lead with the winner (or the tie) and its event visits from `visits`. Then give the likeliest reason from the numbers: for example its own nights jumping (hostVisitsWithoutEvent to hostVisitsWithEvent), visits pulled from venues nearby, or Qloo fit against regulars. Event visits are only `visits` and min/max; never call hostVisitsWithEvent event visits. Don't restate how many futures it won; the panel already says so.",
    tools: opts.qloo ? qlooTools(opts.qloo) : {},
    stopWhen: isStepCount(3),
    maxRetries: 0,
    maxOutputTokens: 300,
    abortSignal: opts.abortSignal,
  });
  return clean(result.text, 600);
}
