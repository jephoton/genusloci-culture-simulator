import type { SimConfig } from "@/sim/config";

/** Seed and config overrides the playable demo runs with (shared with `pnpm calibrate --london`). */
export const DEMO_SEED = 7;
/**
 * The demo runs on daily ticks (one tick = one day; residents decide each day whether to go out, mostly
 * at the weekend). Ecology settings are in weeks and were tuned with `pnpm calibrate --london` for a
 * two-way ecosystem. A venue closes after 8 weeks below 40%
 * occupancy of its rolling week (so it is flagged as struggling for a while first); a niche needs a score
 * of 2.5 to auto-open. Resident turnover and the scene-split check are enabled here (the general defaults
 * leave them off). Residential moves stay off: on the real Qloo cities they lowered fidelity (London
 * 0.22 → 0.15, Singapore 0.11 → 0.06, New York 0.31 → 0.22 at week 60, seeds 7/11/23) without adding
 * scene splits; see docs/current-state.md. Offline ecology evidence: scripts/measure-ecology.ts.
 */
export const DEMO_CONFIG: Partial<SimConfig> = {
  nAgents: 2500,
  ticksPerWeek: 7,
  agentReserve: 300,
  closeThreshold: 0.4,
  closeAfterTicks: 8,
  autoOpenScore: 2.5,
  residentTurnoverRate: 0.008,
  sceneSplitSimilarity: 0.7,
};
