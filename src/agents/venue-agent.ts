import { generateText, hasToolCall, isStepCount, tool } from "ai";
import { z } from "zod";
import { qlooTools } from "@/agents/copilot";
import { isInvalidSignal, QlooBudgetError } from "@/qloo/transport";
import { type RaceContext, raceHelperInstructions } from "@/agents/race-helper";
import type { QlooClient } from "@/qloo/client";

// The race's agent. It picks which three venues race (from the Qloo shortlist the browser sends,
// after checking the artist's taste in Qloo and the venues' own tags), and it explains the result.
// It never runs the simulation or invents numbers: the race itself stays deterministic.

export const MAX_CANDIDATES = 8;
export const PICKS = 3;

const CandidateSchema = z.object({
  id: z.string().regex(/^v\d$/),
  name: z.string().min(1).max(80),
  kind: z.string().max(40),
  area: z.string().max(80),
  /** Qloo affinity relative to the best candidate, 0–100. */
  qlooFit: z.number().min(0).max(100),
  /** Residents who went there in the last simulated week. */
  regulars: z.number().int().min(0),
  /** Readable Qloo tags for the venue. */
  tags: z.array(z.string().max(60)).max(12),
});
export type Candidate = z.infer<typeof CandidateSchema>;

export const PickBodySchema = z.object({
  city: z.string().min(1).max(60),
  artist: z.string().min(1).max(80),
  artistNote: z.string().max(300).optional(),
  /** The artist's Qloo tags from the city's data, if the city knows them. */
  artistTags: z.array(z.string().max(60)).max(20).optional(),
  candidates: z.array(CandidateSchema).min(1).max(MAX_CANDIDATES),
});
export type PickBody = z.infer<typeof PickBodySchema>;

export type Pick = { id: string; reason: string };
/** One thing the agent did, in plain words, for the panel. */
export type Step = { text: string };
export type PickResult = { picks: Pick[]; summary: string; steps: Step[] };

/** "urn:tag:genre:music:uk_garage" → "uk garage". */
export const readableTag = (urn: string) => (urn.split(":").at(-1) ?? urn).replace(/_/g, " ");

export function pickInstructions(body: PickBody): string {
  return [
    `You are the scout for a venue race in ${body.city}. The visitor wants to book ${body.artist}. Qloo's taste data has shortlisted the venues below; you choose ${Math.min(PICKS, body.candidates.length)} of them to race in a simulation of the city's residents.`,
    "Work like a booker: first call artist_taste to learn the artist's genres and style; then call inspect_venue on the venues worth a closer look; then call choose_venues once.",
    "Choose venues whose crowds plausibly share the artist's tastes. Prefer a mix that makes the race informative (for example a strong Qloo fit with few regulars against a weaker fit with many). Regulars are simulated residents, Qloo fit is real taste data.",
    "Each reason is one plain sentence under 18 words that links the venue's crowd or ambience to the artist's style where the tags support it, or cites the Qloo fit or regulars. The summary is one sentence on how the three differ. Never invent numbers or tags.",
    body.artistNote ? `About the artist: ${body.artistNote}` : "",
    "",
    "Shortlist (JSON):",
    JSON.stringify(body.candidates.map((c) => ({ id: c.id, name: c.name, kind: c.kind, area: c.area, qlooFit: c.qlooFit, regulars: c.regulars }))),
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
            if (hit?.tags.length) return { artist: hit.name, tags: hit.tags.slice(0, 15).map((t) => t.name) };
          } catch (e) {
            if (!(e instanceof QlooBudgetError) && !isInvalidSignal(e)) throw e;
          }
        }
        return body.artistTags?.length ? { artist: body.artist, tags: body.artistTags } : { error: "No taste data for this artist; use the Qloo fit." };
      },
    }),
    inspect_venue: tool({
      description: "A shortlisted venue's Qloo tags (its crowd and ambience), plus its Qloo fit and simulated regulars.",
      inputSchema: z.object({ id: z.string() }),
      execute: async ({ id }) => {
        const c = byId.get(id);
        return c ? { name: c.name, kind: c.kind, area: c.area, qlooFit: c.qlooFit, regulars: c.regulars, tags: c.tags } : { error: `No venue ${id} on the shortlist.` };
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
  const out = (output ?? {}) as { tags?: string[]; error?: string };
  if (name === "artist_taste") {
    if (out.error || !out.tags?.length) return `Looked up ${body.artist} in Qloo (no taste data)`;
    return `Looked up ${body.artist} in Qloo: ${out.tags.slice(0, 4).map(readableTag).join(", ")}`;
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
    if (!out.some((p) => p.id === c.id)) out.push({ id: c.id, reason: `Qloo fit ${Math.round(c.qlooFit)}, with ${c.regulars} regulars this week.` });
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
  for (const step of result.steps) {
    for (const r of step.toolResults) {
      if (!r) continue;
      if (r.toolName === "choose_venues") choice = r.input as { picks: Pick[]; summary: string };
      else {
        const text = describe(body, r.toolName, r.input, r.output);
        if (text) steps.push({ text });
      }
    }
  }
  const ids = new Set(body.candidates.map((c) => c.id));
  const valid: Pick[] = [];
  for (const p of choice?.picks ?? []) {
    if (ids.has(p.id) && !valid.some((v) => v.id === p.id) && p.reason.trim()) valid.push({ id: p.id, reason: clean(p.reason, 160) });
  }
  const picks = fallbackPicks(body, valid);
  if (valid.length < picks.length) steps.push({ text: valid.length ? "Filled the rest with the next best Qloo fits" : "Didn't settle on venues, so took the best Qloo fits" });
  return { picks, summary: clean(choice?.summary ?? "", 220), steps };
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
