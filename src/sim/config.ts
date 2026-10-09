import { z } from "zod";

export type SimConfig = {
  nAgents: number;
  friendsPerAgent: number;
  /** Genes sampled from the archetype at birth. */
  initialGenes: number;
  /** P(go out this tick) = outingRate × agent energy. */
  outingRate: number;
  /** Softmax sharpness for venue choice. */
  beta: number;
  distPenaltyPerKm: number;
  /** Score bonus × fraction of friends at the venue last tick. */
  friendBonus: number;
  /** Weight added to genes shared with the attended venue (scaled by profile). */
  reinforce: number;
  /** P(adopt) = adoptBase × (affinity + socialWeight × friend share). */
  adoptBase: number;
  socialWeight: number;
  initialAdoptWeight: number;
  /** P(drift) = driftRate × curiosity. */
  driftRate: number;
  decayRate: number;
  minWeight: number;
  /** EMA factor for venue health. */
  healthAlpha: number;
  closeThreshold: number;
  closeAfterTicks: number;
  /** No closures before this tick. */
  graceTicks: number;
  maxNearby: number;
  /** Spare venue slots for openVenue, scheduleEvent and auto-opening. */
  venueReserve: number;
  /** Spare agent slots for migration. */
  agentReserve: number;
  maxEvents: number;
  /** Run scene clustering (and auto-opening) every N ticks. */
  sceneEvery: number;
  maxScenes: number;
  minSceneSize: number;
  /** A sampled agent whose best cosine to every scene is below this founds a new scene. */
  newSceneThreshold: number;
  /** Agents sampled per clustering run when looking for new scenes. */
  sceneSample: number;
  kmeansIters: number;
  /** A new cluster continues or splits from a lineage only if at least this share of it came from that lineage. */
  splitShare: number;
  /** A dying lineage counts as merged if at least this share of its members went to one cluster. */
  mergeShare: number;
  autoOpen: boolean;
  /** Niche score (scene size ÷ (1 + matching venue capacity)) needed to auto-open a venue. */
  autoOpenScore: number;
};

export const DEFAULT_CONFIG: SimConfig = {
  nAgents: 5000,
  friendsPerAgent: 10,
  initialGenes: 16,
  outingRate: 0.6,
  beta: 4,
  distPenaltyPerKm: 0.3,
  friendBonus: 1.5,
  reinforce: 0.05,
  adoptBase: 0.3,
  socialWeight: 0.5,
  initialAdoptWeight: 0.15,
  driftRate: 0.05,
  decayRate: 0.02,
  minWeight: 0.02,
  healthAlpha: 0.2,
  closeThreshold: 0.1,
  closeAfterTicks: 4,
  graceTicks: 4,
  maxNearby: 12,
  venueReserve: 64,
  agentReserve: 1000,
  maxEvents: 8,
  sceneEvery: 4,
  maxScenes: 12,
  minSceneSize: 25,
  newSceneThreshold: 0.2,
  sceneSample: 400,
  kmeansIters: 3,
  splitShare: 0.3,
  mergeShare: 0.3,
  autoOpen: true,
  autoOpenScore: 2,
};

const int = (min: number, max?: number) => (max === undefined ? z.number().int().min(min) : z.number().int().min(min).max(max));
const unit = z.number().min(0).max(1);
const nonNeg = z.number().min(0);

/** Runtime validation for every SimConfig field; the type check below keeps it in sync with SimConfig. */
export const SimConfigSchema = z.object({
  nAgents: int(1, 20000),
  friendsPerAgent: int(0, 50),
  initialGenes: int(1, 32),
  outingRate: unit,
  beta: nonNeg,
  distPenaltyPerKm: nonNeg,
  friendBonus: nonNeg,
  reinforce: unit,
  adoptBase: unit,
  socialWeight: nonNeg,
  initialAdoptWeight: unit,
  driftRate: unit,
  decayRate: unit,
  minWeight: unit,
  healthAlpha: unit,
  closeThreshold: unit,
  closeAfterTicks: int(1),
  graceTicks: int(0),
  maxNearby: int(1, 64),
  venueReserve: int(0, 1000),
  agentReserve: int(0, 20000),
  maxEvents: int(0, 64),
  sceneEvery: int(1, 520),
  maxScenes: int(1, 64),
  minSceneSize: int(1),
  newSceneThreshold: unit,
  sceneSample: int(0, 20000),
  kmeansIters: int(1, 20),
  splitShare: unit,
  mergeShare: unit,
  autoOpen: z.boolean(),
  autoOpenScore: nonNeg,
});

// Compile-time guard: the schema's output type must be exactly SimConfig.
type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;
const _schemaMatchesConfig: Equal<z.infer<typeof SimConfigSchema>, SimConfig> = true;
void _schemaMatchesConfig;

/** Validates untrusted config overrides (unknown keys rejected, explicit undefined dropped). Throws on invalid input. */
export function parseConfigOverrides(json: unknown): Partial<SimConfig> {
  const parsed = SimConfigSchema.partial().strict().parse(json);
  return Object.fromEntries(Object.entries(parsed).filter(([, v]) => v !== undefined)) as Partial<SimConfig>;
}
