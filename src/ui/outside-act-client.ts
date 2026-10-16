import { matchOutsideAct, type OutsideAct } from "@/agents/outside-act";
import type { QEntity, QTag } from "@/qloo/schemas";
import type { World } from "@/world/schema";

/** Stable Qloo IDs cross the network; indices are resolved only in the caller's world. Never throws. */
export async function fetchOutsideAct(city: string, name: string, world: Pick<World, "entities">): Promise<OutsideAct | { error: string }> {
  try {
    const res = await fetch("/api/outside-act", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ city, name }) });
    const body = (await res.json().catch(() => null)) as { evidence?: { artist: QEntity; similar: QEntity[]; tags: QTag[] }; error?: string } | null;
    if (res.ok && body?.evidence) {
      const { artist, similar, tags } = body.evidence;
      return matchOutsideAct(world, artist, similar, tags) ?? { error: `Qloo couldn't connect ${artist.name} to this city's tastes.` };
    }
    return { error: body?.error ?? `Lookup failed (${res.status})` };
  } catch {
    return { error: "Couldn't reach the server for the Qloo lookup." };
  }
}
