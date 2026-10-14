/**
 * In-memory token bucket per key (e.g. client IP): `capacity` requests, refilled at `perMinute`.
 * Per server instance only, which is enough to stop one visitor draining the LLM and Qloo budgets.
 */
export function createRateLimiter(capacity: number, perMinute: number, now: () => number = Date.now) {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    /** True if the request may proceed (and consumes a token). */
    take(key: string): boolean {
      const t = now();
      const b = buckets.get(key) ?? { tokens: capacity, at: t };
      b.tokens = Math.min(capacity, b.tokens + ((t - b.at) / 60_000) * perMinute);
      b.at = t;
      const ok = b.tokens >= 1;
      if (ok) b.tokens -= 1;
      buckets.set(key, b);
      if (buckets.size > 10_000) buckets.delete(buckets.keys().next().value as string);
      return ok;
    },
  };
}

/** The caller's IP as Vercel and most proxies report it, else "local". */
export const clientKey = (req: Request) => req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
