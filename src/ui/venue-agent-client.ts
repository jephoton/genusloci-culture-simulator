import type { RaceContext } from "@/agents/race-helper";
import type { PickBody, PickResult } from "@/agents/venue-agent";

/** Long enough for a few Qloo lookups and model steps; past this the race goes ahead without the agent. */
const TIMEOUT_MS = 25_000;

async function post<T>(body: unknown, signal?: AbortSignal): Promise<T | { error: string }> {
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  try {
    const res = await fetch("/api/venue-agent", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json) return { error: res.status === 503 ? "offline" : "failed" };
    return json as T;
  } catch {
    return { error: timeout.aborted ? "slow" : "failed" };
  }
}

export const agentPick = (body: PickBody, signal?: AbortSignal) => post<PickResult>({ mode: "pick", ...body }, signal);

export async function agentExplain(city: string, context: RaceContext, signal?: AbortSignal): Promise<string | null> {
  const r = await post<{ text: string }>({ mode: "explain", city, context }, signal);
  return "error" in r || !r.text ? null : r.text;
}

/** Why the agent's picks were replaced by the top Qloo fits, in plain words. */
export function agentFallbackNote(error: string): string {
  if (error === "offline") return "The scout agent is offline here, so these are the three best matches by Qloo fit and fans nearby.";
  if (error === "slow") return "The scout agent took too long, so these are the three best matches by Qloo fit and fans nearby.";
  return "The scout agent couldn't answer just now, so these are the three best matches by Qloo fit and fans nearby.";
}
