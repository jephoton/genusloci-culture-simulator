import type { SimConfig } from "@/sim/config";

/** Seed and config overrides the playable demo runs with (shared with `pnpm calibrate --london`). */
export const DEMO_SEED = 7;
/**
 * The demo runs on daily ticks (one tick = one day; residents decide each day whether to go out, mostly
 * at the weekend). Ecology settings are in weeks and were tuned with `pnpm calibrate --london` for a
 * two-way ecosystem: over 100 weeks (700 daily ticks) 5–6 natural closures against 7 auto-openings
 * (seeds 7, 11, 23), never fewer open venues than at the start. A venue closes after 8 weeks below 40%
 * occupancy of its rolling week (so it is flagged as struggling for a while first); a niche needs a score
 * of 2.5 to auto-open. Daily ticks needed no re-tuning: weekly ticks gave 4–5 closures and 6–7 openings.
 */
export const DEMO_CONFIG: Partial<SimConfig> = {
  nAgents: 2500,
  ticksPerWeek: 7,
  agentReserve: 300,
  closeThreshold: 0.4,
  closeAfterTicks: 8,
  autoOpenScore: 2.5,
};
