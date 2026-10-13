import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { autoOpenVenue, findNiches } from "@/sim/niches";
import { createRng } from "@/sim/rng";
import { clusterAgents } from "@/sim/scenes/cluster";
import { updateLineages } from "@/sim/scenes/lineage";
import { initState } from "@/sim/state";
import { DEFAULT_VENUE_CAPACITY } from "@/sim/world-index";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const clusterOf = (e: number) => Math.floor(e / 12);

function withScenes(overrides = {}) {
  const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 0, minSceneSize: 20, ...overrides }, 3);
  updateLineages(s.scenes, clusterAgents(s, [], createRng(1)), 0, s.config);
  return s;
}

describe("findNiches", () => {
  it("returns nothing before any scenes exist", () => {
    const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 50, agentReserve: 0 }, 1);
    expect(findNiches(s, 3)).toEqual([]);
  });

  it("ranks unserved scenes first and proposes a matching place in their home turf", () => {
    const s = withScenes();
    s.venueOpen.fill(0);
    const niches = findNiches(s, 3);
    expect(niches).toHaveLength(3);
    expect(niches[0].score).toBeGreaterThanOrEqual(niches[1].score);
    for (const n of niches) {
      const scene = s.scenes.lineages[n.scene];
      expect(clusterOf(n.entity)).toBe(clusterOf(scene.topEntities[0]));
      expect(world.entities[n.entity].type).toBe("place");
      expect(n.cell).toBeLessThan(world.cells.length);
      expect(n.score).toBe(scene.size);
    }
  });

  it("prefers places that have never been in the city over ones that opened and closed", () => {
    // A world with a spare, never-placed copy of every venue: the copy should be proposed instead.
    const originals = world.entities.flatMap((e, i) => (e.type === "place" && e.cell !== undefined ? [i] : []));
    const spares = originals.map((i) => ({ ...world.entities[i], id: `${world.entities[i].id}:spare`, cell: undefined }));
    const w = { ...world, entities: [...world.entities, ...spares] };
    const s = initState(w, { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 0, minSceneSize: 20 }, 3);
    updateLineages(s.scenes, clusterAgents(s, [], createRng(1)), 0, s.config);
    s.venueOpen.fill(0);
    for (const n of findNiches(s, 3)) {
      expect(n.entity).toBeGreaterThanOrEqual(world.entities.length);
      expect(world.entities[originals[n.entity - world.entities.length]].type).toBe("place");
    }
  });

  it("scores well-served scenes lower", () => {
    const s = withScenes();
    const before = findNiches(s, 3).map((n) => n.score);
    s.venueCapacity.fill(1e6);
    const after = findNiches(s, 3).map((n) => n.score);
    expect(Math.max(...after)).toBeLessThan(Math.min(...before));
  });
});

describe("autoOpenVenue", () => {
  it("opens a venue for an underserved scene", () => {
    const s = withScenes();
    s.venueOpen.fill(0);
    const v = autoOpenVenue(s);
    expect(v).toBe(12);
    expect(s.venueOpen[v]).toBe(1);
    expect(s.nVenues).toBe(13);
  });

  it("opens at the place's own capacity, falling back to the default", () => {
    const s = withScenes();
    s.venueOpen.fill(0);
    const v = autoOpenVenue(s);
    expect(s.venueCapacity[v]).toBe(world.entities[s.venueEntity[v]].capacity);

    const bare = { ...world, entities: world.entities.map((e) => ({ ...e, capacity: undefined })) };
    const t = initState(bare, { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 0, minSceneSize: 20 }, 3);
    updateLineages(t.scenes, clusterAgents(t, [], createRng(1)), 0, t.config);
    t.venueOpen.fill(0);
    expect(t.venueCapacity[autoOpenVenue(t)]).toBe(DEFAULT_VENUE_CAPACITY);
  });

  it("does nothing when disabled, when demand is met, or when the table is full", () => {
    const off = withScenes({ autoOpen: false });
    off.venueOpen.fill(0);
    expect(autoOpenVenue(off)).toBe(-1);

    const served = withScenes();
    served.venueCapacity.fill(1e6);
    expect(autoOpenVenue(served)).toBe(-1);

    const full = withScenes({ venueReserve: 0 });
    full.venueOpen.fill(0);
    expect(autoOpenVenue(full)).toBe(-1);
  });
});
