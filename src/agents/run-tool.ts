import { type CityContext, citySummary, describeWhatIf, find, sceneInfo, toSimActions, venueInfo } from "@/agents/city";
import { CLIENT_TOOLS, type ClientToolName } from "@/agents/tools";
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
  /** Called after the co-pilot changes the live city (for toasts and camera). */
  onApplied?(actions: Action[]): void;
}

export const isClientTool = (name: string): name is ClientToolName => Object.hasOwn(CLIENT_TOOLS, name);

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
      case "city_summary":
        return citySummary(ctx);
      case "find": {
        const p = parsed.data as { query: string; kind?: Parameters<typeof find>[2] };
        return find(ctx, p.query, p.kind);
      }
      case "venue":
        return venueInfo(ctx, (parsed.data as { venue: number }).venue);
      case "scene":
        return sceneInfo(ctx, (parsed.data as { scene: number }).scene);
      case "what_if": {
        const p = parsed.data as { actions: Parameters<typeof toSimActions>[1]; weeks?: number };
        const mapped = toSimActions(ctx, p.actions);
        if ("error" in mapped) return mapped;
        const { result } = await deps.whatIf(mapped.actions, p.weeks ?? 8);
        return describeWhatIf(ctx, result);
      }
      case "apply": {
        const p = parsed.data as { actions: Parameters<typeof toSimActions>[1] };
        const mapped = toSimActions(ctx, p.actions);
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
