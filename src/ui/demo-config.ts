import type { SimConfig } from "@/sim/config";

/** Seed and config overrides the playable demo runs with (shared with `pnpm calibrate --london`). */
export const DEMO_SEED = 7;
export const DEMO_CONFIG: Partial<SimConfig> = { nAgents: 2500, agentReserve: 300 };
