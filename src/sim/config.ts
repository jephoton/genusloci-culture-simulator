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
};
