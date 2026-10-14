import type { QEntity, QTag } from "@/qloo/schemas";
import type { World } from "@/world/schema";

// An artist the city doesn't know, described in the city's own terms: the in-city artists and tags
// that Qloo says the artist's fans also like. The simulation then runs the act as an event with that
// taste profile (scheduleEvent.profile).

export type OutsideAct = {
  artist: { name: string; description?: string };
  /** In this city's world already (then it can be booked directly). */
  inCity: number | null;
  similar: { entity: number; name: string; affinity: number }[];
  tags: { entity: number; name: string }[];
  /** The event's taste: similar artists (weighted by rank) and shared tags. */
  profile: { entity: number; weight: number }[];
  /** Entity the event is filed under (its most similar in-city artist, or strongest tag). */
  proxy: number;
};

const MAX_SIMILAR = 8;
/** Venue attributes that say nothing about an artist's crowd (ownership, inclusivity, age bands). */
const NOT_A_TASTE = /^urn:tag:(inclusivity|age_range):/;
const MAX_TAGS = 8;

/** Matches Qloo's answer about an artist to the world's entities; null if nothing in the city connects. */
export function matchOutsideAct(world: Pick<World, "entities">, artist: QEntity, similar: QEntity[], tags: QTag[]): OutsideAct | null {
  const index = new Map(world.entities.map((e, i) => [e.id, i]));
  const own = index.get(artist.id);
  const inCity = own !== undefined && world.entities[own].type === "artist" ? own : null;

  const sim = similar
    .filter((a) => a.id !== artist.id)
    .flatMap((a, rank) => {
      const i = index.get(a.id);
      return i !== undefined && world.entities[i].type === "artist" ? [{ entity: i, name: world.entities[i].name, affinity: a.affinity ?? 1 - rank / 50 }] : [];
    })
    .slice(0, MAX_SIMILAR);
  const tagHits = tags
    .flatMap((t) => {
      const i = index.get(t.id);
      return i !== undefined && world.entities[i].type === "tag" && !NOT_A_TASTE.test(t.id) ? [{ entity: i, name: world.entities[i].name }] : [];
    })
    .slice(0, MAX_TAGS);
  if (inCity === null && sim.length === 0 && tagHits.length === 0) return null;

  const profile = new Map<number, number>();
  if (inCity !== null) profile.set(inCity, 1);
  sim.forEach((s, rank) => profile.set(s.entity, Math.max(profile.get(s.entity) ?? 0, 0.9 - (0.5 * rank) / MAX_SIMILAR)));
  tagHits.forEach((t, rank) => profile.set(t.entity, Math.max(profile.get(t.entity) ?? 0, 0.6 - (0.3 * rank) / MAX_TAGS)));

  return {
    artist: { name: artist.name, description: artist.description },
    inCity,
    similar: sim,
    tags: tagHits,
    profile: [...profile].map(([entity, weight]) => ({ entity, weight: Math.round(weight * 100) / 100 })),
    proxy: inCity ?? sim[0]?.entity ?? tagHits[0].entity,
  };
}
