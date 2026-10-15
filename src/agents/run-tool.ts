import { type CityContext, citySummary, describeWhatIf, find, listVenues, sceneInfo, toSimActions, venueInfo } from "@/agents/city";
import type { OutsideAct } from "@/agents/outside-act";
import { CLIENT_TOOLS, type ClientToolName, type CopilotAction } from "@/agents/tools";
import type { Action } from "@/sim/actions/schema";
import type { SimDigest } from "@/sim/digest";
import type { WhatIfResult } from "@/sim/whatif";

/** What the browser needs to run the co-pilot's city tools. */
export interface ToolDeps {
  /** The city as of now (latest frame); `digest` is refreshed first. */
  context(digest: SimDigest | null): CityContext | null;
  latestDigest(): Promise<SimDigest>;
  whatIf(actions: Action[], weeks: number): Promise<{ result: WhatIfResult }>;
  act(action: Action): Promise<boolean>;
  /** Looks an artist the city doesn't know up in Qloo (via /api/outside-act). */
  outsideAct?(name: string): Promise<OutsideAct | { error: string }>;
  /** Called after the co-pilot changes the live city (for toasts and camera). */
  onApplied?(actions: Action[]): void;
}

export const isClientTool = (name: string): name is ClientToolName => Object.hasOwn(CLIENT_TOOLS, name);

/** Looks up every outside artist the actions name; an error message if any can't be resolved. */
async function resolveOutside(actions: CopilotAction[], deps: ToolDeps): Promise<Map<string, OutsideAct> | { error: string }> {
  const out = new Map<string, OutsideAct>();
  for (const a of actions) {
    if (a.do !== "throw_event" || a.outside_artist === undefined || out.has(a.outside_artist)) continue;
    if (!deps.outsideAct) return { error: "Outside artists can't be looked up here." };
    const r = await deps.outsideAct(a.outside_artist);
    if ("error" in r) return r;
    out.set(a.outside_artist, r);
  }
  return out;
}

/** What the model should know about the outside artists it used (who Qloo says their fans are). */
const outsideNotes = (m: Map<string, OutsideAct>) =>
  [...m.values()].map((a) => ({
    artist: a.artist.name,
    alreadyInCity: a.inCity !== null,
    fansAlsoLike: a.similar.map((s) => s.name),
    sharedTastes: a.tags.map((t) => t.name),
    note: a.inCity === null ? "Simulated as an event with this crowd's taste (from live Qloo data); fan counts don't apply." : undefined,
  }));

/** Runs one co-pilot city tool. Never throws: problems come back as `{ error }` for the model to read. */
export async function runCityTool(name: string, input: unknown, deps: ToolDeps): Promise<unknown> {
  if (!isClientTool(name)) return { error: `Unknown tool ${name}` };
  const parsed = CLIENT_TOOLS[name].inputSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: `Bad input for ${name}: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  try {
    const digest = await deps.latestDigest();
    const ctx = deps.context(digest);
    if (!ctx) return { error: "The city is still loading." };
    switch (name) {
      case "event_calendar":
        return { tick: ctx.frame.tick, ticksPerWeek: ctx.frame.ticksPerWeek, events: (ctx.frame.scheduledEvents ?? []).map((e) => ({ id: e.id, artist: e.action.label ?? ctx.world.entities[e.action.entity]?.name, startTick: e.startTick, durationDays: e.action.durationDays, durationWeeks: e.action.duration, status: e.status, error: e.error })) };
      case "city_summary":
        return citySummary(ctx);
      case "find": {
        const p = parsed.data as { query: string; kind?: Parameters<typeof find>[2] };
        return find(ctx, p.query, p.kind);
      }
      case "venues":
        return listVenues(ctx, parsed.data as Parameters<typeof listVenues>[1]);
      case "venue":
        return venueInfo(ctx, (parsed.data as { venue: number }).venue);
      case "scene":
        return sceneInfo(ctx, (parsed.data as { scene: number }).scene);
      case "what_if": {
        const p = parsed.data as { actions: CopilotAction[]; weeks?: number };
        const outside = await resolveOutside(p.actions, deps);
        if ("error" in outside) return outside;
        const mapped = toSimActions(ctx, p.actions, outside);
        if ("error" in mapped) return mapped;
        const { result } = await deps.whatIf(mapped.actions, p.weeks ?? 8);
        const described = describeWhatIf(ctx, result);
        return outside.size > 0 ? { ...described, outsideArtists: outsideNotes(outside) } : described;
      }
      case "apply": {
        const p = parsed.data as { actions: CopilotAction[] };
        const outside = await resolveOutside(p.actions, deps);
        if ("error" in outside) return outside;
        const mapped = toSimActions(ctx, p.actions, outside);
        if ("error" in mapped) return mapped;
        const results: string[] = [];
        for (const a of mapped.actions) results.push((await deps.act(a)) ? "done" : "rejected by the simulation");
        deps.onApplied?.(mapped.actions);
        return { applied: results };
      }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
