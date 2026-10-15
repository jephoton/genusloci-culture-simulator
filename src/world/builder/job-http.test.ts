import { describe, expect, it } from "vitest";
import { createBuildHandlers } from "./job-http";

function fixture(token = "operator-test-token") {
  let advances = 0;
  const handlers = createBuildHandlers(() => token, () => ({
    status: async () => null,
    advance: async (city: string, maxCalls: number) => { advances++; return { city, maxCalls, status: "ready" as const }; },
    quota: async () => ({ remaining: 5000, period: "2026-10", currentPeriod: "2026-10", floor: 1000 }),
    reconcileQuota: async (remaining: number, period: string) => {
      if (period !== "2026-10") throw new Error("Quota can only be reconciled for the current period (2026-10)");
      return { remaining, period };
    },
  }));
  const request = (body: unknown, authorized = true) => new Request("http://local/api/world-builds", {
    method: "POST", headers: authorized ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body),
  });
  return { handlers, request, count: () => advances };
}

describe("world build operator endpoint", () => {
  it("reports quota with status and reconciles it with PATCH, validating input", async () => {
    const f = fixture();
    const auth = { Authorization: "Bearer operator-test-token" };
    const status = await f.handlers.GET(new Request("http://local/api/world-builds?city=london", { headers: auth }));
    expect(await status.json()).toEqual({ build: null, quota: { remaining: 5000, period: "2026-10", currentPeriod: "2026-10", floor: 1000 } });
    const patch = (body: unknown, headers: Record<string, string> = auth) => f.handlers.PATCH(new Request("http://local/api/world-builds", { method: "PATCH", headers, body: JSON.stringify(body) }));
    expect((await patch({ remaining: 4200, period: "2026-10" })).status).toBe(200);
    expect((await patch({ remaining: 4200, period: "2026-09" })).status).toBe(400);
    expect((await patch({ remaining: 20000, period: "2026-10" })).status).toBe(400);
    expect((await patch({ remaining: 4200, period: "2026-10" }, {})).status).toBe(401);
  });

  it("rejects unauthenticated requests before creating services or doing work", async () => {
    const f = fixture();
    expect((await f.handlers.POST(f.request({ city: "london" }, false))).status).toBe(401);
    expect((await f.handlers.GET(new Request("http://local/api/world-builds?city=london"))).status).toBe(401);
    expect(f.count()).toBe(0);
  });
  it("disables the endpoint when no token is configured", async () => {
    const f = fixture("");
    expect((await f.handlers.POST(f.request({ city: "london" }))).status).toBe(503);
  });
  it("validates city, budgets, retry and unexpected parameters", async () => {
    const f = fixture();
    for (const body of [{ city: "__proto__" }, { city: "london", maxCalls: 181 }, { city: "london", retry: "yes" }, { city: "london", arbitrary: true }]) {
      expect((await f.handlers.POST(f.request(body))).status).toBe(400);
    }
    expect(f.count()).toBe(0);
  });
  it("advances one bounded stage and returns private uncached status", async () => {
    const f = fixture();
    const response = await f.handlers.POST(f.request({ city: "london", maxCalls: 40 }));
    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ build: { city: "london", maxCalls: 40, status: "ready" } });
    expect(f.count()).toBe(1);
  });
});
