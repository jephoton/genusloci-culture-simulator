import { fileCache } from "@/qloo/cache";
import type { QlooClient } from "@/qloo/client";
import { qlooFromEnv } from "@/qloo/env";

/** Live (in-app) Qloo use never goes below this many monthly calls, leaving the rest for city builds. */
export const LIVE_BUDGET_FLOOR = 1000;

/** The Qloo client for in-app routes (co-pilot, outside acts), or null if Qloo isn't configured. */
export function liveQlooClient(): QlooClient | null {
  try {
    const floor = Math.max(LIVE_BUDGET_FLOOR, Number(process.env.QLOO_BUDGET_FLOOR ?? 0));
    return qlooFromEnv({
      cache: fileCache(process.env.QLOO_CACHE_DIR ?? ".cache/qloo"),
      env: { ...process.env, QLOO_BUDGET_FLOOR: String(floor) },
    }).client;
  } catch {
    return null;
  }
}
