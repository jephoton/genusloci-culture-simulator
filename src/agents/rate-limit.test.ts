import { describe, expect, it } from "vitest";
import { clientKey, createRateLimiter } from "@/agents/rate-limit";

describe("createRateLimiter", () => {
  it("allows a burst up to capacity, then refills over time, per key", () => {
    let t = 0;
    const rl = createRateLimiter(2, 6, () => t);
    expect([rl.take("a"), rl.take("a"), rl.take("a")]).toEqual([true, true, false]);
    expect(rl.take("b")).toBe(true);
    t += 10_000; // 6 per minute → one token every 10 s
    expect(rl.take("a")).toBe(true);
    expect(rl.take("a")).toBe(false);
  });

  it("keys requests by forwarded IP", () => {
    expect(clientKey(new Request("http://x", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } }))).toBe("1.2.3.4");
    expect(clientKey(new Request("http://x"))).toBe("local");
  });
});
