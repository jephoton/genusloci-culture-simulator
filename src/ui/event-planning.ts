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

export type RaceVenue = VenueFit & { /** Taste-weighted residents within an event's reach (simulation). */ fans: number };

/**
 * Venues for the race: every open club, bar and music venue (and other venues Qloo links to the act),
 * ranked by Qloo affinity to the act (zero where the city's data links none), with fans nearby in
 * the simulated city breaking ties. Unlike `rankArtistVenues`, no artist comes up empty.
 */
export function rankRaceVenues(world: World, frame: Frame, act: BookingAct, fans: readonly number[], limit = 12): RaceVenue[] {
  const qloo = new Map(rankArtistVenues(world, frame, act, Infinity).map((f) => [f.slot, f.affinity]));
  const out: RaceVenue[] = [];
  for (let slot = 0; slot < frame.nVenues; slot++) {
    if (!frame.venueOpen[slot] || frame.venueExpires[slot] >= 0) continue;
    const entity = world.entities[frame.venueEntity[slot]];
    const affinity = qloo.get(slot) ?? 0;
    if (!["club", "bar", "music_venue"].includes(entity.kind ?? "other") && affinity <= 0) continue;
    out.push({ slot, name: frame.venueLabels?.[slot] ?? entity.name, kind: (entity.kind ?? "venue").replace("_", " "), affinity, fans: fans[slot] ?? 0 });
  }
  const topFit = Math.max(1e-9, ...out.map((v) => v.affinity));
  const topFans = Math.max(1e-9, ...out.map((v) => v.fans));
  const score = (v: RaceVenue) => v.affinity / topFit + 0.25 * (v.fans / topFans);
  return out.sort((a, b) => score(b) - score(a) || a.slot - b.slot).slice(0, limit);
}
