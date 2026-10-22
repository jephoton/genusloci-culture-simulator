import { type CityContext, citySummary, describeWhatIf, find, listVenues, sceneInfo, toSimActions, venueInfo } from "@/agents/city";
import type { OutsideAct } from "@/agents/outside-act";
import { CLIENT_TOOLS, type ClientToolName, type CopilotAction } from "@/agents/tools";
import type { Action } from "@/sim/actions/schema";
import type { SimDigest } from "@/sim/digest";
import type { WhatIfResult } from "@/sim/whatif";

/** What the browser needs to run the co-pilot's city tools. */
export interface ToolDeps {
  /** Shared by model comparisons and local explicit apply, never inferred from prose. */
  comparison?: { current: ComparedPlan | null };
  /** Main case flow stores predictions but shows observed results only after playback. */
  deferComparisonSummary?: boolean;
  isCaseActive?(): boolean;
  /** Stop the current observation before a validated replacement; city changes remain applied. */
  beforeChange?(): Promise<void>;
  onInspectVenue?(slot: number, context: CityContext): void;
  /** The city as of now (latest frame); `digest` is refreshed first. */
  context(digest: SimDigest | null): CityContext | null;
  latestDigest(): Promise<SimDigest>;
  whatIf(actions: Action[], weeks: number): Promise<{ result: WhatIfResult }>;
  act(action: Action): Promise<boolean>;
  /** Looks an artist the city doesn't know up in Qloo (via /api/outside-act). */
  outsideAct?(name: string): Promise<OutsideAct | { error: string }>;
  /** Called after the co-pilot changes the live city (for toasts and camera). */
  onApplied?(actions: Action[], before: CityContext, plan?: ComparedPlan): void | Promise<void>;
  onCompared?(actions: Action[], before: CityContext): void;
  onComparisonCleared?(): void;
}

export type ComparedPlan = { actions: Action[]; weeks: number; epoch: number; timeline: string; venues: { slot: number; entity: number; cell: number }[] };

export function clearComparison(deps: ToolDeps): void {
  if (deps.comparison) deps.comparison.current = null;
  deps.onComparisonCleared?.();
}

async function replacementContext(deps: ToolDeps, before: CityContext, actions: Action[]): Promise<CityContext | { error: string }> {
  if (!deps.isCaseActive?.()) return before;
  if (!deps.beforeChange) return { error: "Finish the current case or resume the city before preparing another change." };
  if (actions.some((a) => a.type === "closeVenue" && !before.frame.venueOpen[a.venue])) return { error: "That venue is already closed in the model. Choose an open venue." };
  await deps.beforeChange();
  const after = deps.context(await deps.latestDigest());
  if (!after || after.frame.epoch !== before.frame.epoch || after.frame.timeline !== before.frame.timeline || actions.some((a) => a.type === "closeVenue" && (after.frame.venueEntity[a.venue] !== before.frame.venueEntity[a.venue] || after.frame.venueCell[a.venue] !== before.frame.venueCell[a.venue] || after.frame.venueExpires[a.venue] !== before.frame.venueExpires[a.venue]))) return { error: "The target or timeline changed while stopping the previous case. Describe the new change again." };
  return after;
}

async function applyActions(actions: Action[], deps: ToolDeps, ctx: CityContext, plan?: ComparedPlan): Promise<unknown> {
  if (deps.comparison) deps.comparison.current = null;
  const accepted: Action[] = [];
  const results: string[] = [];
  for (const action of actions) {
    const ok = await deps.act(action);
    results.push(ok ? "done" : "rejected by the simulation");
    if (ok) accepted.push(action);
  }
  if (accepted.length) await deps.onApplied?.(accepted, ctx, plan);
  return { applied: results };
}

/** Apply only a successfully executed comparison, with timeline and slot identity guards. */
export async function applyLastComparison(deps: ToolDeps): Promise<unknown> {
  const plan = deps.comparison?.current;
  if (!plan) return { error: "There is no previous comparison to apply. Describe one change first." };
  deps.comparison!.current = null; // Consume before awaiting: double delivery cannot apply twice.
  try {
    const initial = deps.context(await deps.latestDigest());
    if (!initial || initial.frame.epoch !== plan.epoch || initial.frame.timeline !== plan.timeline || plan.venues.some((v) => initial.frame.venueEntity[v.slot] !== v.entity || initial.frame.venueCell[v.slot] !== v.cell || !initial.frame.venueOpen[v.slot])) return { error: "The city changed or this comparison belongs to a discarded timeline. Compare again before applying." };
    const replacement = await replacementContext(deps, initial, plan.actions);
    if ("error" in replacement) return replacement;
    const ctx = replacement;
    if (!ctx || ctx.frame.epoch !== plan.epoch || ctx.frame.timeline !== plan.timeline || plan.venues.some((v) => ctx.frame.venueEntity[v.slot] !== v.entity || ctx.frame.venueCell[v.slot] !== v.cell || !ctx.frame.venueOpen[v.slot])) {
      return { error: "The city changed or this comparison belongs to a discarded timeline. Compare again before applying." };
    }
    return await applyActions(plan.actions, deps, ctx, plan);
  } catch { return { error: "The comparison could not be applied. Check the city before trying again." }; }
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
  if (name === "what_if") clearComparison(deps);
  if (!isClientTool(name)) return { error: `Unknown tool ${name}` };
  const parsed = CLIENT_TOOLS[name].inputSchema.safeParse(input ?? {});
  if (!parsed.success) return { error: `Bad input for ${name}: ${parsed.error.issues.map((i) => i.message).join("; ")}` };
  try {
    const digest = await deps.latestDigest();
    let ctx = deps.context(digest);
    if (!ctx) return { error: "The city is still loading." };
    switch (name) {
      case "event_calendar": {
        const calendarContext = ctx;
        return { tick: ctx.frame.tick, ticksPerWeek: ctx.frame.ticksPerWeek, events: (ctx.frame.scheduledEvents ?? []).map((e) => ({ id: e.id, artist: e.action.label ?? calendarContext.world.entities[e.action.entity]?.name, startTick: e.startTick, durationDays: e.action.durationDays, durationWeeks: e.action.duration, status: e.status, error: e.error })) };
      }
      case "city_summary": {
        const summary = citySummary(ctx);
        if (!deps.deferComparisonSummary) return summary;
        return { ...summary, week: undefined, ticksPerWeek: undefined, recentActions: summary.recentActions.map((a) => ({ change: a.action })), note: "An ongoing live simulation; describe current state and case changes, not calendar weeks." };
      }
      case "find": {
        const p = parsed.data as { query: string; kind?: Parameters<typeof find>[2] };
        return find(ctx, p.query, p.kind);
      }
      case "venues": {
        const opts = parsed.data as Parameters<typeof listVenues>[1];
        const result = listVenues(ctx, { ...opts, limit: Math.max(2, opts?.limit ?? 5) });
        const top = result.venues[0];
        if (result.sort === "busiest" && top && (result.total === 1 || (result.venues[1] && top.weeklyVisits > result.venues[1].weeklyVisits))) deps.onInspectVenue?.(top.venue, ctx);
        return { ...result, venues: result.venues.slice(0, opts?.limit ?? 5) };
      }
      case "venue": {
        const slot = (parsed.data as { venue: number }).venue;
        const result = venueInfo(ctx, slot);
        if (!("error" in result)) deps.onInspectVenue?.(slot, ctx);
        return result;
      }
      case "scene":
        return sceneInfo(ctx, (parsed.data as { scene: number }).scene);
      case "what_if": {
        const p = parsed.data as { actions: CopilotAction[]; weeks?: number };
        const outside = await resolveOutside(p.actions, deps);
        if ("error" in outside) return outside;
        let mapped = toSimActions(ctx, p.actions, outside);
        if ("error" in mapped) return mapped;
        if (deps.isCaseActive?.()) {
          const replacement = await replacementContext(deps, ctx, mapped.actions);
          if ("error" in replacement) return replacement;
          ctx = replacement;
          mapped = toSimActions(ctx, p.actions, outside);
          if ("error" in mapped) return mapped;
        }
        const { result } = await deps.whatIf(mapped.actions, p.weeks ?? 8);
        const described = describeWhatIf(ctx, result);
        const current = deps.context(null);
        if (!current || current.frame.epoch !== ctx.frame.epoch || current.frame.timeline !== ctx.frame.timeline) return { error: "The timeline changed during comparison. Compare again." };
        if (result.actions.every((r) => r.ok)) {
          const comparedContext = ctx;
          if (deps.comparison) deps.comparison.current = {
            actions: structuredClone(mapped.actions), weeks: p.weeks ?? 8, epoch: ctx.frame.epoch, timeline: ctx.frame.timeline,
            venues: mapped.actions.filter((a) => a.type === "closeVenue").map((a) => ({ slot: a.venue, entity: comparedContext.frame.venueEntity[a.venue], cell: comparedContext.frame.venueCell[a.venue] })),
          };
          deps.onCompared?.(mapped.actions, ctx);
        } else if (deps.comparison) deps.comparison.current = null;
        if (deps.deferComparisonSummary && result.actions.every((r) => r.ok)) return { comparisonReady: true, changes: p.actions, message: "Case prepared. Say apply that to play the highlighted live change. Observed outcomes appear after playback stops. Do not give an outcome summary yet." };
        return outside.size > 0 ? { ...described, outsideArtists: outsideNotes(outside) } : described;
      }
      case "apply": {
        const p = parsed.data as { actions: CopilotAction[] };
        const outside = await resolveOutside(p.actions, deps);
        if ("error" in outside) return outside;
        let mapped = toSimActions(ctx, p.actions, outside);
        if ("error" in mapped) return mapped;
        if (deps.isCaseActive?.()) {
          const replacement = await replacementContext(deps, ctx, mapped.actions);
          if ("error" in replacement) return replacement;
          ctx = replacement;
          mapped = toSimActions(ctx, p.actions, outside);
          if ("error" in mapped) return mapped;
        }
        return applyActions(mapped.actions, deps, ctx);
      }
    }
  } catch (e) {
    return { error: e instanceof Error ? e.message : String(e) };
  }
}
