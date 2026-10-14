import type { CityLayout } from "@/render/layout";
import type { SceneSummary } from "@/sim/digest";

/** Scene units per metre (the layout's scale: 1 unit = 10 m). */
const UNITS_PER_M = 0.1;
/** How far an area tool reaches from where you click. */
export const AREA_RADIUS_M = 400;
/** Newcomer group sizes on offer (the demo keeps 300 spare resident slots). */
export const NEWCOMER_COUNTS = [50, 100, 200] as const;
/** Rent rises on offer, as fractions. */
export const RENT_RISES = [0.25, 0.5, 1] as const;

/** Cells whose centres lie within `radiusM` of a scene point, nearest first; at least the nearest cell. */
export function cellsWithin(layout: Pick<CityLayout, "cellX" | "cellZ">, x: number, z: number, radiusM = AREA_RADIUS_M): number[] {
  const r = radiusM * UNITS_PER_M;
  const byDistance = Array.from(layout.cellX, (cx, c) => ({ c, d: Math.hypot(cx - x, layout.cellZ[c] - z) })).sort((a, b) => a.d - b.d || a.c - b.c);
  const within = byDistance.filter((e) => e.d <= r).map((e) => e.c);
  return within.length > 0 ? within : byDistance.slice(0, 1).map((e) => e.c);
}

/** The tastes newcomers bring when they share a scene's taste: its top entities, strongest first. */
export function sceneGenes(scene: Pick<SceneSummary, "topEntities">): { entity: number; weight: number }[] {
  return scene.topEntities.map((e, i) => ({ entity: e.index, weight: Math.max(0.3, 0.9 - i * 0.05) }));
}
