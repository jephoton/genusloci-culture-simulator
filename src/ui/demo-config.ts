import type { SimConfig } from "@/sim/config";

/** Seed and config overrides the playable demo runs with (shared with `pnpm calibrate --london`). */
export const DEMO_SEED = 7;
/**
 * The demo runs on daily ticks (one tick = one day; residents decide each day whether to go out, mostly
 * at the weekend). Ecology settings are in weeks and were tuned with `pnpm calibrate --london` for a
 * two-way ecosystem. A venue closes after 8 weeks below 40%
 * occupancy of its rolling week (so it is flagged as struggling for a while first); a niche needs a score
 * of 2.5 to auto-open. Residential movement and turnover are enabled here; the general defaults
 * leave them disabled. Offline late-run ecology evidence is reproducible with scripts/measure-ecology.ts.
 */
export const DEMO_CONFIG: Partial<SimConfig> = {
  nAgents: 2500,
  ticksPerWeek: 7,
  agentReserve: 300,
  closeThreshold: 0.4,
  closeAfterTicks: 8,
  autoOpenScore: 2.5,
  residentialMoveRate: 0.025,
  residentTurnoverRate: 0.008,
  sceneSplitSimilarity: 0.7,
};
