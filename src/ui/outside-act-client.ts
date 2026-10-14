import type { OutsideAct } from "@/agents/outside-act";

/** Asks the server (live Qloo) to describe an artist the city doesn't know. Never throws. */
export async function fetchOutsideAct(city: string, name: string): Promise<OutsideAct | { error: string }> {
  try {
    const res = await fetch("/api/outside-act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, name }) });
    const body = (await res.json().catch(() => null)) as { act?: OutsideAct; error?: string } | null;
    if (res.ok && body?.act) return body.act;
    return { error: body?.error ?? `Lookup failed (${res.status})` };
  } catch {
    return { error: "Couldn't reach the server for the Qloo lookup." };
  }
}
