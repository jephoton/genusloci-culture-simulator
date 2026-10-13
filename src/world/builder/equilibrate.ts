import { DEFAULT_CONFIG, type SimConfig } from "@/sim/config";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import type { World } from "@/world/schema";

export interface EquilibrateOptions {
  /** Weeks simulated before measuring (scenes and tastes settle). */
  warmupWeeks: number;
  /** Weeks over which weekly visits are averaged. */
  measureWeeks: number;
  /** Occupancy a venue should sit at with its measured crowd (health settles near this). */
  targetOccupancy: number;
  /** Share of the measured capacity in the result; the rest is the prior (kind × popularity). */
  blend: number;
}

export const EQUILIBRATE_DEFAULTS: EquilibrateOptions = { warmupWeeks: 2, measureWeeks: 4, targetOccupancy: 0.75, blend: 0.5 };

/**
 * Calibrates venue capacities to the baseline city: runs the simulation with closures and openings off,
 * measures each placed venue's weekly visits, and blends `visits / targetOccupancy` into its capacity.
 * Without it every venue's capacity is a guess from its kind, and the mismatch closes a fifth of the
 * city in one wave when the grace period ends. Venues nobody visits keep a share of their prior, so
 * they still struggle. Reserve places are scaled by the placed venues' median change.
 * Deterministic for a given config and seed.
 */
export function equilibrateCapacities(
  world: World,
  config: Partial<SimConfig>,
  seed: number,
  options: Partial<EquilibrateOptions> = {},
): World {
  const o = { ...EQUILIBRATE_DEFAULTS, ...options };
  const s = initState(world, { ...DEFAULT_CONFIG, ...config, closeThreshold: 0, autoOpen: false }, seed);
  const tpw = s.config.ticksPerWeek;
  const n = s.nVenues;
  const visits = new Float64Array(n);
  for (let w = 0; w < o.warmupWeeks + o.measureWeeks; w++) {
    for (let t = 0; t < tpw; t++) step(s);
    if (w >= o.warmupWeeks) for (let v = 0; v < n; v++) visits[v] += s.venueWeekVisits[v] / o.measureWeeks;
  }
  const round = (c: number) => Math.max(1, Math.round(c * 10) / 10);
  const capacityOf = new Map<number, number>();
  const ratios: number[] = [];
  for (let v = 0; v < n; v++) {
    const entity = s.venueEntity[v];
    const prior = world.entities[entity].capacity ?? 1;
    const next = o.blend * (visits[v] / o.targetOccupancy) + (1 - o.blend) * prior;
    capacityOf.set(entity, round(next));
    ratios.push(next / prior);
  }
  // Reserve places (no cell) can't be measured; scale them like the typical placed venue, so one
  // that the niche logic opens isn't sized from the uncalibrated prior.
  ratios.sort((a, b) => a - b);
  const median = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
  world.entities.forEach((e, i) => {
    if (e.type === "place" && e.cell === undefined && e.capacity !== undefined) capacityOf.set(i, round(e.capacity * median));
  });
  return {
    ...world,
    entities: world.entities.map((e, i) => (capacityOf.has(i) ? { ...e, capacity: capacityOf.get(i) } : e)),
  };
}
