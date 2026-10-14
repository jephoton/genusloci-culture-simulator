import { describe, expect, it, vi } from "vitest";
import type { CityContext } from "@/agents/city";
import { runCityTool, type ToolDeps } from "@/agents/run-tool";
import { DEFAULT_CONFIG } from "@/sim/config";
import { digest } from "@/sim/digest";
import { buildFrame } from "@/sim/frame";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { whatIf } from "@/sim/whatif";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 200, agentReserve: 0, sceneEvery: 1 }, 3);
for (let t = 0; t < 2; t++) step(s);
const ctx: CityContext = {
  world,
  frame: buildFrame(s, "main", 0, true, 1).frame,
  digest: digest(s),
  layout: {
    center: { x: 0, z: 0 },
    bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 },
    cellX: new Float32Array(world.cells.length),
    cellZ: new Float32Array(world.cells.length),
  },
};

function deps(over: Partial<ToolDeps> = {}): ToolDeps {
  return {
    context: (d) => ({ ...ctx, digest: d }),
    latestDigest: async () => digest(s),
    whatIf: async (actions, weeks) => ({ result: whatIf(s, actions, weeks) }),
    act: async () => true,
    ...over,
  };
}

describe("runCityTool", () => {
  it("runs the read tools", async () => {
    expect(await runCityTool("city_summary", {}, deps())).toMatchObject({ residents: 200 });
    expect(await runCityTool("venue", { venue: 0 }, deps())).toMatchObject({ venue: 0 });
  });

  it("runs a what-if without touching the live city, and applies only via apply", async () => {
    const act = vi.fn(async () => true);
    const onApplied = vi.fn();
    const r = await runCityTool("what_if", { actions: [{ do: "close_venue", venue: 0 }], weeks: 2 }, deps({ act, onApplied }));
    expect(r).toMatchObject({ weeks: 2, actionsApplied: ["ok"] });
    expect(act).not.toHaveBeenCalled();
    expect(await runCityTool("apply", { actions: [{ do: "close_venue", venue: 0 }] }, deps({ act, onApplied }))).toEqual({ applied: ["done"] });
    expect(act).toHaveBeenCalledWith({ type: "closeVenue", venue: 0 });
    expect(onApplied).toHaveBeenCalledOnce();
  });

  it("returns errors instead of throwing", async () => {
    expect(await runCityTool("nope", {}, deps())).toHaveProperty("error");
    expect(await runCityTool("venue", { venue: "x" }, deps())).toHaveProperty("error");
    expect(await runCityTool("what_if", { actions: [{ do: "close_venue", venue: 9999 }] }, deps())).toHaveProperty("error");
    expect(await runCityTool("city_summary", {}, deps({ latestDigest: async () => { throw new Error("worker gone"); } }))).toEqual({ error: "worker gone" });
    expect(await runCityTool("city_summary", {}, deps({ context: () => null }))).toHaveProperty("error");
  });
});
