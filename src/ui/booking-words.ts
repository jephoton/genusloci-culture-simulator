import type { World } from "@/world/schema";

/**
 * Artists to suggest for a venue: those Qloo recommended for its crowd (direct venue–artist edges),
 * then artists that share its taste (linked to the venue's own tags), strongest first.
 */
export function suggestActs(world: Pick<World, "entities" | "edges">, venueEntity: number, n = 3): number[] {
  const isArtist = (i: number) => world.entities[i]?.type === "artist";
  const direct = new Map<number, number>();
  const viaTags = new Map<number, number>();
  const venueTags = new Set<number>();
  for (const e of world.edges) {
    if (e.source !== venueEntity) continue;
    if (isArtist(e.target)) direct.set(e.target, Math.max(direct.get(e.target) ?? 0, e.weight));
    else if (world.entities[e.target]?.type === "tag") venueTags.add(e.target);
  }
  for (const e of world.edges) {
    if (venueTags.has(e.source) && isArtist(e.target)) viaTags.set(e.target, (viaTags.get(e.target) ?? 0) + e.weight);
  }
  const rank = (m: Map<number, number>) => [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0]).map(([i]) => i);
  const out: number[] = [];
  for (const i of [...rank(direct), ...rank(viaTags)]) {
    if (!out.includes(i)) out.push(i);
    if (out.length >= n) break;
  }
  return out;
}

type Line = { label: string; turnout: number; hostChange: number; neighbourLoss: number };

/** One plain sentence on the best act, led by what matters to the owner: their own venue. */
export function bookingVerdict(ranked: Line[], venue: string): string {
  const [best, next] = ranked;
  if (!best) return "";
  if (best.turnout <= 0) return "None of these acts draws a crowd here yet.";
  const host = Math.round(best.hostChange);
  const own =
    host > 0 ? `and brings ${venue} ${host} extra visits` : host < 0 ? `but takes ${-host} visits from ${venue}'s usual nights` : `and leaves ${venue}'s usual nights as they are`;
  const lead = `${best.label} is the best bet: ${Math.round(best.turnout)} visits ${own}`;
  if (!next) return `${lead}.`;
  const gap = next.turnout > 0 ? (best.turnout - next.turnout) / next.turnout : Infinity;
  return gap < 0.1 ? `${lead}; ${next.label} is close behind.` : `${lead}.`;
}
