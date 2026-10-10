import type { SimConfig } from "@/sim/config";

/** Seed and config overrides the playable demo runs with (shared with `pnpm calibrate --london`). */
export const DEMO_SEED = 7;
/**
 * Ecology tuned with `pnpm calibrate --london` for a two-way ecosystem: over 100 weeks about 4–5 natural
 * closures against 6–7 auto-openings (seeds 7, 11, 23), never fewer open venues than at the start, and
 * ≤ 3% of venues struggling at a time. A venue closes after 8 weeks below 40% occupancy (so it is
 * flagged as struggling for a while first); a niche needs a score of 2.5 to auto-open.
 */
export const DEMO_CONFIG: Partial<SimConfig> = {
  nAgents: 2500,
  agentReserve: 300,
  closeThreshold: 0.4,
  closeAfterTicks: 8,
  autoOpenScore: 2.5,
};
