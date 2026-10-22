import { describe, expect, it, vi } from "vitest";
import type { CityContext } from "@/agents/city";
import { runCityTool, type ToolDeps } from "@/agents/run-tool";
import { runOfflineChat } from "@/agents/offline-chat";
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
  it("finishes an active observation before a valid new intervention and refreshes its context", async () => {
    let active = true;
    const order: string[] = [];
    const shared = deps({ isCaseActive: () => active, beforeChange: async () => { order.push("finish"); active = false; }, act: async () => { order.push("apply"); return true; }, onApplied: (_, before) => { expect(before.frame.tick).toBe(ctx.frame.tick + 1); }, context: (d) => ({ ...ctx, digest: d, frame: { ...ctx.frame, tick: ctx.frame.tick + (active ? 0 : 1) } }) });
    expect(await runCityTool("apply", { actions: [{ do: "close_venue", venue: 0 }] }, shared)).toEqual({ applied: ["done"] });
    expect(order).toEqual(["finish", "apply"]);
  });
  it("does not release an active case for an invalid target", async () => {
    const beforeChange = vi.fn(async () => {});
    const shared = deps({ isCaseActive: () => true, beforeChange });
    expect(await runCityTool("apply", { actions: [{ do: "close_venue", venue: 99999 }] }, shared)).toHaveProperty("error");
    expect(beforeChange).not.toHaveBeenCalled();
  });
  it("connects read tools to venue inspection including a unique busiest result", async () => {
    const onInspectVenue = vi.fn();
    const shared = deps({ onInspectVenue });
    await runCityTool("venue", { venue: 0 }, shared);
    expect(onInspectVenue).toHaveBeenCalledWith(0, expect.anything());
    onInspectVenue.mockClear();
    const visits = new Int32Array(ctx.frame.nVenues); visits[0] = 10;
    const ranked = deps({ onInspectVenue, context: () => ({ ...ctx, frame: { ...ctx.frame, venueWeekVisits: visits } }) });
    const result = await runCityTool("venues", { sort: "busiest", limit: 1 }, ranked);
    expect(onInspectVenue).toHaveBeenCalledWith(0, expect.anything());
    expect((result as { venues: unknown[] }).venues).toHaveLength(1);
    onInspectVenue.mockClear(); visits.fill(0);
    await runCityTool("venues", { sort: "busiest", limit: 1 }, ranked);
    expect(onInspectVenue).not.toHaveBeenCalled();
  });
  it("rejects a target replaced during case handoff without applying it", async () => {
    let stopped = false;
    const act = vi.fn(async () => true);
    const shared = deps({ act, isCaseActive: () => true, beforeChange: async () => { stopped = true; }, context: () => ({ ...ctx, frame: { ...ctx.frame, epoch: ctx.frame.epoch + (stopped ? 1 : 0) } }) });
    expect(await runCityTool("apply", { actions: [{ do: "close_venue", venue: 0 }] }, shared)).toHaveProperty("error");
    expect(act).not.toHaveBeenCalled();
  });
  it("allows preparing and applying a replacement case after ending the previous observation", async () => {
    let active = true;
    const beforeChange = vi.fn(async () => { active = false; });
    const act = vi.fn(async () => true);
    const shared = deps({ beforeChange, act, isCaseActive: () => active, comparison: { current: null }, deferComparisonSummary: true });
    expect(await runCityTool("what_if", { actions: [{ do: "close_venue", venue: 0 }], weeks: 1 }, shared)).toMatchObject({ comparisonReady: true });
    expect(beforeChange).toHaveBeenCalledOnce();
    expect((await runOfflineChat("apply that", shared)).text).toContain("done");
    expect(act).toHaveBeenCalledExactlyOnceWith({ type: "closeVenue", venue: 0 });
  });
  it("defers case outcomes until playback and preserves the prepared plan", async () => {
    const shared = deps({ deferComparisonSummary: true, comparison: { current: null } });
    const ready = await runCityTool("what_if", { actions: [{ do: "close_venue", venue: 0 }] }, shared);
    expect(ready).toMatchObject({ comparisonReady: true });
    expect(ready).not.toHaveProperty("biggestGainers");
    expect(shared.comparison?.current?.actions).toEqual([{ type: "closeVenue", venue: 0 }]);
    const act = vi.fn(async () => true);
    const blocked = await runCityTool("apply", { actions: [{ do: "close_venue", venue: 0 }] }, deps({ isCaseActive: () => true, act }));
    expect(blocked).toHaveProperty("error");
    expect(act).not.toHaveBeenCalled();
  });
  it("invalidates the older plan when a newer comparison cannot resolve or validate", async () => {
    const act = vi.fn(async () => true);
    const shared = deps({ act, comparison: { current: null } });
    for (const fail of [async () => runOfflineChat("what if Unknown Venue closes", shared), async () => runCityTool("what_if", { actions: "invalid" }, shared)]) {
      await runCityTool("what_if", { actions: [{ do: "close_venue", venue: 0 }], weeks: 1 }, shared);
      await fail();
      await runOfflineChat("apply that", shared);
      expect(act).not.toHaveBeenCalled();
    }
  });
  it("applies the exact AI comparison through local apply-that once", async () => {
    const act = vi.fn(async () => true);
    const shared = deps({ act, comparison: { current: null } });
    await runCityTool("what_if", { actions: [{ do: "close_venue", venue: 0 }], weeks: 1 }, shared);
    expect(act).not.toHaveBeenCalled();
    expect((await runOfflineChat("apply that", shared)).text).toContain("done");
    expect(act).toHaveBeenCalledExactlyOnceWith({ type: "closeVenue", venue: 0 });
    expect((await runOfflineChat("apply that", shared)).text).toContain("no previous comparison");
  });

  it("rejects a remembered comparison after rewind and does not announce rejected actions", async () => {
    const act = vi.fn(async () => false);
    const onApplied = vi.fn();
    const memory = { current: null };
    const shared = deps({ act, onApplied, comparison: memory });
    await runCityTool("what_if", { actions: [{ do: "close_venue", venue: 0 }], weeks: 1 }, shared);
    const rewound = deps({ act, comparison: memory, context: () => ({ ...ctx, frame: { ...ctx.frame, epoch: ctx.frame.epoch + 1 } }) });
    expect((await runOfflineChat("apply that", rewound)).text).toMatch(/changed|discarded|stale/i);
    expect(act).not.toHaveBeenCalled();
    await runCityTool("apply", { actions: [{ do: "close_venue", venue: 0 }] }, shared);
    expect(onApplied).not.toHaveBeenCalled();
  });
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

  it("looks outside artists up and simulates them with their crowd's taste", async () => {
    const artist = world.entities.findIndex((e) => e.type === "artist");
    const outsideAct = vi.fn(async (name: string) => ({
      artist: { name },
      inCity: null,
      similar: [{ entity: artist, name: world.entities[artist].name, affinity: 0.9 }],
      tags: [],
      profile: [{ entity: artist, weight: 0.9 }],
      proxy: artist,
    }));
    const whatIfSpy = vi.fn(async (actions: Parameters<ToolDeps["whatIf"]>[0], weeks: number) => ({ result: whatIf(s, actions, weeks, 1) }));
    const r = (await runCityTool("what_if", { actions: [{ do: "throw_event", outside_artist: "Visiting Star", area: { near_venue: 0 } }], weeks: 1 }, deps({ outsideAct, whatIf: whatIfSpy }))) as {
      outsideArtists: { artist: string; fansAlsoLike: string[] }[];
    };
    expect(outsideAct).toHaveBeenCalledWith("Visiting Star");
    expect(whatIfSpy.mock.calls[0][0][0]).toMatchObject({ type: "scheduleEvent", entity: artist, profile: [{ entity: artist, weight: 0.9 }] });
    expect(r.outsideArtists[0]).toMatchObject({ artist: "Visiting Star", fansAlsoLike: [world.entities[artist].name] });
    expect(await runCityTool("what_if", { actions: [{ do: "throw_event", outside_artist: "Nobody", area: { near_venue: 0 } }] }, deps({ outsideAct: async () => ({ error: "Qloo doesn't know them" }) }))).toEqual({ error: "Qloo doesn't know them" });
    expect(await runCityTool("what_if", { actions: [{ do: "throw_event", area: { near_venue: 0 } }] }, deps())).toHaveProperty("error");
  });

  it("returns errors instead of throwing", async () => {
    expect(await runCityTool("nope", {}, deps())).toHaveProperty("error");
    expect(await runCityTool("venue", { venue: "x" }, deps())).toHaveProperty("error");
    expect(await runCityTool("what_if", { actions: [{ do: "close_venue", venue: 9999 }] }, deps())).toHaveProperty("error");
    expect(await runCityTool("city_summary", {}, deps({ latestDigest: async () => { throw new Error("worker gone"); } }))).toEqual({ error: "worker gone" });
    expect(await runCityTool("city_summary", {}, deps({ context: () => null }))).toHaveProperty("error");
  });
});
