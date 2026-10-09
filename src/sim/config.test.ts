import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, parseConfigOverrides, SimConfigSchema } from "@/sim/config";

describe("SimConfigSchema", () => {
  it("accepts the default config", () => {
    expect(SimConfigSchema.parse(DEFAULT_CONFIG)).toEqual(DEFAULT_CONFIG);
  });
});

describe("parseConfigOverrides", () => {
  it("accepts valid partial overrides", () => {
    expect(parseConfigOverrides({ nAgents: 300, autoOpen: false })).toEqual({ nAgents: 300, autoOpen: false });
  });

  it.each([{ sceneEvery: 0 }, { nAgents: 1e6 }, { autoOpen: "no" }, { bogus: 1 }])("rejects %j", (bad) => {
    expect(() => parseConfigOverrides(bad)).toThrow();
  });

  it("drops keys whose value is undefined", () => {
    const out = parseConfigOverrides({ nAgents: 300, outingRate: undefined });
    expect(out).toEqual({ nAgents: 300 });
    expect("outingRate" in out).toBe(false);
  });
});
