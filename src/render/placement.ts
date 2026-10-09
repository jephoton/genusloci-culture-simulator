import type { VenueKind, World } from "@/world/schema";

/**
 * The real place entity to open when the user asks for a venue of `kind` in `cell`: among places of
 * that kind, the one whose taste links best to the cell's archetype mix (so a new venue suits its
 * neighbourhood). Falls back to the best place of any kind.
 */
export function chooseVenueEntity(world: World, kind: VenueKind, cell: number): number {
  const affinity = new Map<number, number>();
  const mix = world.cells[cell]?.archetypes ?? [];
  const geneWeight = new Map<number, number>();
  for (const { archetype, weight } of mix) {
    for (const g of world.archetypes[archetype].genes) geneWeight.set(g.entity, (geneWeight.get(g.entity) ?? 0) + weight * g.weight);
  }
  for (const e of world.edges) {
    const w = geneWeight.get(e.target);
    if (w !== undefined) affinity.set(e.source, (affinity.get(e.source) ?? 0) + w * e.weight);
  }
  let best = -1;
  let bestScore = -Infinity;
  let fallback = -1;
  let fallbackScore = -Infinity;
  world.entities.forEach((e, i) => {
    if (e.type !== "place") return;
    const score = affinity.get(i) ?? 0;
    if (score > fallbackScore) [fallback, fallbackScore] = [i, score];
    if ((e.kind ?? "other") === kind && score > bestScore) [best, bestScore] = [i, score];
  });
  return best >= 0 ? best : fallback;
}
