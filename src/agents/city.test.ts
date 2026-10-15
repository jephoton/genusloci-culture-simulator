import { describe, expect, it } from "vitest";
import { type CityContext, citySummary, describeWhatIf, find, listVenues, personaOf, resolveArea, sceneInfo, toSimActions, venueInfo } from "@/agents/city";
import { PersonaSchema } from "@/agents/interview";
import { residentProfile } from "@/sim/resident";
import { DEFAULT_CONFIG } from "@/sim/config";
import { digest } from "@/sim/digest";
import { buildFrame } from "@/sim/frame";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { whatIf } from "@/sim/whatif";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

// Tiny world with neighbourhood names on a few cells (synthetic data).
const base = makeTinyWorld();
const world = { ...base, cells: base.cells.map((c, i) => (i < 4 ? { ...c, area: "Old Town" } : c)) };
const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 0, sceneEvery: 1 }, 3);
for (let t = 0; t < 3; t++) step(s);
const { frame } = buildFrame(s, "main", 0, true, 1);
const ctx: CityContext = {
  world,
  frame,
  digest: digest(s),
  layout: {
    center: { x: 0, z: 0 },
    bounds: { minX: -100, maxX: 100, minZ: -100, maxZ: 100 },
    cellX: Float32Array.from(world.cells.map((_, i) => (i % 4) * 50 - 75)),
    cellZ: Float32Array.from(world.cells.map((_, i) => Math.floor(i / 4) * 50 - 75)),
  },
};

describe("city tools", () => {
  it("summarises the city with named scenes and their homes", () => {
    const sum = citySummary(ctx);
    expect(sum.residents).toBe(300);
    expect(sum.scenes.length).toBeGreaterThan(0);
    expect(sum.scenes[0].name).toMatch(/^Scene \d+ \(/);
    expect(sum.scenes[0].homes.length).toBeGreaterThan(0);
    expect(citySummary({ ...ctx, sceneNames: new Map([[sum.scenes[0].id, "Night Owls"]]) }).scenes[0].name).toBe("Night Owls");
  });

  it("finds venues, artists and areas by name, best match first", () => {
    const venueName = world.entities[frame.venueEntity[0]].name;
    const r = find(ctx, venueName.toLowerCase());
    expect(r.results[0]).toMatchObject({ kind: "venue", venue: 0, name: venueName });
    const artist = world.entities.findIndex((e) => e.type === "artist");
    expect(find(ctx, world.entities[artist].name, "artist").results[0]).toMatchObject({ kind: "artist", id: artist });
    expect(find(ctx, "old town", "area").results).toEqual([{ kind: "area", name: "Old Town", cells: 4 }]);
    expect(find(ctx, "zzzz").results).toEqual([]);
  });

  it("ranks venues by estimated weekly visits or by health, with filters", () => {
    const busiest = listVenues(ctx, { limit: 3 });
    expect(busiest.venues).toHaveLength(3);
    for (let i = 1; i < busiest.venues.length; i++) expect(busiest.venues[i - 1].weeklyVisits).toBeGreaterThanOrEqual(busiest.venues[i].weeklyVisits);
    const struggling = listVenues(ctx, { sort: "struggling" });
    for (let i = 1; i < struggling.venues.length; i++) expect(struggling.venues[i - 1].health).toBeLessThanOrEqual(struggling.venues[i].health);
    const kind = world.entities[frame.venueEntity[0]].kind!;
    expect(listVenues(ctx, { kind }).venues.every((v) => v.kind === kind)).toBe(true);
    expect(listVenues(ctx, { area: "Nowhere" }).total).toBe(0);
  });

  it("describes a venue and a scene, and explains bad ids", () => {
    const v = venueInfo(ctx, 0);
    expect(v).toMatchObject({ venue: 0, open: true, event: false });
    expect(venueInfo(ctx, 9999)).toHaveProperty("error");
    const id = ctx.digest!.scenes[0].id;
    expect(sceneInfo(ctx, id)).toMatchObject({ scene: id, size: ctx.digest!.scenes[0].size });
    expect(sceneInfo(ctx, 9999)).toHaveProperty("error");
  });

  it("resolves areas and maps co-pilot actions to simulation actions", () => {
    expect(resolveArea(ctx, { name: "old town" })).toEqual([0, 1, 2, 3]);
    expect(resolveArea(ctx, { near_venue: 0 })).toEqual([frame.venueCell[0]]);
    expect(resolveArea(ctx, { name: "Atlantis" })).toHaveProperty("error");
    const artist = world.entities.findIndex((e) => e.type === "artist");
    const sceneId = ctx.digest!.scenes[0].id;
    const r = toSimActions(ctx, [
      { do: "close_venue", venue: 0 },
      { do: "throw_event", artist, area: { name: "Old Town" } },
      { do: "rent_pressure", area: { name: "Old Town" }, magnitude: 0.5 },
      { do: "open_venue", kind: "club", area: { near_venue: 1 } },
      { do: "migrate", count: 50, area: { near_venue: 1 }, like_scene: sceneId },
    ]);
    if ("error" in r) throw new Error(r.error);
    expect(r.actions.map((a) => a.type)).toEqual(["closeVenue", "scheduleEvent", "rentPressure", "openVenue", "migrate"]);
    expect(r.actions[2]).toMatchObject({ cells: [0, 1, 2, 3], magnitude: 0.5 });
    expect(toSimActions(ctx, [{ do: "throw_event", artist: frame.venueEntity[0], area: { name: "Old Town" } }])).toHaveProperty("error");
  });
  it("maps dated events and calendar cancellation for the co-pilot", () => {
    const artist = world.entities.findIndex((e) => e.type === "artist");
    const r = toSimActions(ctx, [{ do: "throw_event", artist, area: { near_venue: 0 }, start_tick: frame.tick + 7, nights: 1 }]);
    if ("error" in r) throw new Error(r.error);
    expect(r.actions[0]).toMatchObject({ startTick: frame.tick + 7, durationDays: 1 });
    const dated = { ...ctx, frame: { ...frame, scheduledEvents: [{ id: 9, startTick: 12, action: { type: "scheduleEvent" as const, entity: artist, cell: 0, duration: 1, reachKm: 1, capacity: 100 }, status: "scheduled" as const }] } };
    expect(toSimActions(dated, [{ do: "cancel_event", event: 9 }])).toEqual({ actions: [{ type: "cancelEvent", event: 9 }] });
  });

  it("builds a valid interview persona from a resident", () => {
    const p = personaOf(ctx, residentProfile(s, 5));
    expect(() => PersonaSchema.parse(p)).not.toThrow();
    expect(p.city).toBe(world.city.name);
    expect(p.tastes.length).toBeGreaterThan(0);
  });

  it("names a what-if result for the model", () => {
    const r = describeWhatIf(ctx, whatIf(s, [{ type: "closeVenue", venue: 0 }], 3));
    expect(r.actionsApplied).toEqual(["ok"]);
    expect(r.venuesThatCloseOnlyWithChange[0]).toEqual({ venue: world.entities[frame.venueEntity[0]].name, inRuns: `${r.runs} of ${r.runs}` });
    expect(r.biggestLosers[0]).toMatchObject({ venue: world.entities[frame.venueEntity[0]].name, verdict: "clear" });
    expect(r.biggestLosers[0].change).toMatch(/^-\d+/);
    expect(r.scenes.every((x) => x.verdict === "clear" || x.verdict === "too small to call")).toBe(true);
    expect(r.note).toContain(`${r.runs} times`);
  });
});
