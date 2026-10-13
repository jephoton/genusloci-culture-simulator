import { describe, expect, it } from "vitest";
import { qlooFromEnv } from "@/qloo/env";

describe("qlooFromEnv", () => {
  it("requires QLOO_API_KEY", () => {
    expect(() => qlooFromEnv({ env: {} })).toThrow(/QLOO_API_KEY is not set/);
    expect(() => qlooFromEnv({ env: { QLOO_API_KEY: "  " } })).toThrow(/QLOO_API_KEY/);
  });

  it("builds a client when the key is present", () => {
    const { client, transport } = qlooFromEnv({ env: { QLOO_API_KEY: "k" } });
    expect(typeof client.places).toBe("function");
    expect(transport.stats()).toEqual({ calls: 0, cacheHits: 0, rateLimited: 0 });
  });
});
