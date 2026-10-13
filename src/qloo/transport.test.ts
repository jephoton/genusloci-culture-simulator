import { describe, expect, it } from "vitest";
import { buildUrl, cacheKey, createTransport, isInvalidSignal, QlooBudgetError, QlooError, type TransportOptions } from "@/qloo/transport";
import { memoryCache } from "@/qloo/cache";

type Reply = { status: number; body?: unknown; headers?: Record<string, string> } | Error;

/** A fake fetch that serves replies in order and records the requests. */
function fakeFetch(replies: Reply[]) {
  const calls: { url: string; headers: Record<string, string>; at: number }[] = [];
  let clock = 0;
  const fetch = async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string>, at: clock });
    const r = replies.shift();
    if (!r) throw new Error("no more replies");
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.body ?? { success: true }), {
      status: r.status,
      headers: { "content-type": "application/json", ...r.headers },
    });
  };
  const sleeps: number[] = [];
  const opts: TransportOptions = {
    apiKey: "test-key",
    fetch: fetch as typeof globalThis.fetch,
    now: () => clock,
    sleep: async (ms) => {
      sleeps.push(ms);
      clock += ms;
    },
  };
  return { calls, sleeps, opts };
}

const id = (j: unknown) => j;

describe("buildUrl / cacheKey", () => {
  it("sorts params, joins arrays with commas and skips undefined", () => {
    const url = buildUrl("https://x.test", "/v2/insights", {
      take: 5,
      "filter.type": "urn:entity:place",
      "signal.interests.entities": ["a", "b"],
      offset: undefined,
    });
    expect(url).toBe("https://x.test/v2/insights?filter.type=urn%3Aentity%3Aplace&signal.interests.entities=a%2Cb&take=5");
  });

  it("gives the same key regardless of param order", () => {
    expect(cacheKey("/p", { a: 1, b: "x" })).toBe(cacheKey("/p", { b: "x", a: 1 }));
    expect(cacheKey("/p", { a: 1 })).not.toBe(cacheKey("/q", { a: 1 }));
  });
});

describe("createTransport", () => {
  it("sends the key header and parses the body", async () => {
    const f = fakeFetch([{ status: 200, body: { success: true, n: 1 } }]);
    const t = createTransport(f.opts);
    expect(await t.get("/search", { query: "x" }, id)).toEqual({ success: true, n: 1 });
    expect(f.calls[0].headers["X-Api-Key"]).toBe("test-key");
    expect(f.calls[0].url).toBe("https://hackathon.api.qloo.com/search?query=x");
  });

  it("starts at most 4 requests per rolling second", async () => {
    const f = fakeFetch(Array.from({ length: 9 }, () => ({ status: 200 })));
    const t = createTransport(f.opts);
    for (let i = 0; i < 9; i++) await t.get("/p", { i }, id);
    const starts = f.calls.map((c) => c.at);
    for (let i = 4; i < starts.length; i++) expect(starts[i] - starts[i - 4]).toBeGreaterThanOrEqual(1000);
  });

  it("waits for the reset header on 429 and retries without counting it as a call", async () => {
    const f = fakeFetch([
      { status: 429, body: { error_msg: "Rate limit exceeded" }, headers: { "X-Second-RateLimit-Reset": "0.4" } },
      { status: 200, body: { ok: 1 }, headers: { "X-Month-RateLimit-Remaining": "9000" } },
    ]);
    const t = createTransport(f.opts);
    expect(await t.get("/p", {}, id)).toEqual({ ok: 1 });
    expect(f.sleeps).toContain(400);
    expect(t.stats()).toMatchObject({ calls: 1, rateLimited: 1, monthRemaining: 9000 });
  });

  it("backs off exponentially on 5xx and network errors, then gives up", async () => {
    const f = fakeFetch([{ status: 502 }, new Error("ECONNRESET"), { status: 200, body: { ok: 1 } }]);
    const t = createTransport({ ...f.opts, maxRetries: 3 });
    expect(await t.get("/p", {}, id)).toEqual({ ok: 1 });
    expect(f.sleeps.slice(0, 2)).toEqual([500, 1000]);

    const g = fakeFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);
    const u = createTransport({ ...g.opts, maxRetries: 2 });
    await expect(u.get("/p", {}, id)).rejects.toThrow(QlooError);
  });

  it("throws the server's message on other 4xx without retrying", async () => {
    const f = fakeFetch([{ status: 400, body: { errors: [{ message: "take must be an integer value between 1 and 50" }] } }]);
    const t = createTransport(f.opts);
    const err = await t.get("/p", {}, id).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(QlooError);
    expect((err as QlooError).status).toBe(400);
    expect((err as Error).message).toContain("take must be");
    expect(f.calls).toHaveLength(1);
  });

  it("caches the parsed value, so a repeat costs no call", async () => {
    const f = fakeFetch([{ status: 200, body: { v: 2 } }]);
    const t = createTransport({ ...f.opts, cache: memoryCache() });
    const parse = (j: unknown) => (j as { v: number }).v * 10;
    expect(await t.get("/p", { a: 1 }, parse)).toBe(20);
    expect(await t.get("/p", { a: 1 }, parse)).toBe(20);
    expect(f.calls).toHaveLength(1);
    expect(t.stats()).toMatchObject({ calls: 1, cacheHits: 1 });
  });

  it("refuses network calls once the monthly quota falls below the floor, but serves the cache", async () => {
    const f = fakeFetch([{ status: 200, body: { v: 1 }, headers: { "X-Month-RateLimit-Remaining": "99" } }]);
    const t = createTransport({ ...f.opts, cache: memoryCache(), budgetFloor: 100 });
    await t.get("/p", { a: 1 }, id);
    await expect(t.get("/p", { a: 2 }, id)).rejects.toThrow(QlooBudgetError);
    expect(await t.get("/p", { a: 1 }, id)).toEqual({ v: 1 });
    expect(f.calls).toHaveLength(1);
  });

  it("does not cache values the parser rejects", async () => {
    const f = fakeFetch([{ status: 200, body: { bad: true } }, { status: 200, body: { v: 1 } }]);
    const t = createTransport({ ...f.opts, cache: memoryCache() });
    const parse = (j: unknown) => {
      const v = (j as { v?: number }).v;
      if (v === undefined) throw new Error("bad shape");
      return v;
    };
    await expect(t.get("/p", {}, parse)).rejects.toThrow("bad shape");
    expect(await t.get("/p", {}, parse)).toBe(1);
  });

  it("remembers 400s in the cache so a known-bad request costs nothing the second time", async () => {
    const msg = "All of the provided signal.interests.entities were invalid. At least one valid signal or filter is required.";
    const f = fakeFetch([{ status: 400, body: { errors: [{ message: msg }] } }]);
    const t = createTransport({ ...f.opts, cache: memoryCache() });
    const first = await t.get("/p", { a: 1 }, id).catch((e: unknown) => e);
    const second = await t.get("/p", { a: 1 }, id).catch((e: unknown) => e);
    expect(isInvalidSignal(first)).toBe(true);
    expect(isInvalidSignal(second)).toBe(true);
    expect((second as QlooError).status).toBe(400);
    expect(f.calls).toHaveLength(1);
  });
});
