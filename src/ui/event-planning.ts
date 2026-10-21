import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";
import type { BookingAct } from "@/ui/BookingPanel";

export type VenueFit = { slot: number; name: string; kind: string; affinity: number };

/** A shortlist from Qloo affinity edges, not a turnout forecast or real availability claim. */
export function rankArtistVenues(world: World, frame: Frame, act: BookingAct, limit = 3): VenueFit[] {
  const signals = new Map(act.profile ? act.profile.map((p) => [p.entity, p.weight]) : [[act.entity, 1]]);
  const scores = new Map<number, number>();
  for (const edge of world.edges) {
    const weight = signals.get(edge.target);
    if (weight !== undefined) scores.set(edge.source, (scores.get(edge.source) ?? 0) + edge.weight * weight);
  }
  const fits: VenueFit[] = [];
  for (let slot = 0; slot < frame.nVenues; slot++) {
    if (!frame.venueOpen[slot] || frame.venueExpires[slot] >= 0) continue;
    const entity = world.entities[frame.venueEntity[slot]];
    if (!["club", "bar", "music_venue", "other"].includes(entity.kind ?? "other")) continue;
    const affinity = scores.get(frame.venueEntity[slot]) ?? 0;
    if (affinity <= 0) continue;
    fits.push({ slot, name: frame.venueLabels?.[slot] ?? entity.name, kind: (entity.kind ?? "venue").replace("_", " "), affinity });
  }
  return fits.sort((a, b) => b.affinity - a.affinity || a.slot - b.slot).slice(0, limit);
}
