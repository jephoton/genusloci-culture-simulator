import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { activeEvents, addVenue, buildNearbyVenues, hasVenueRoom } from "@/sim/venue-table";
import { distKm } from "@/sim/world-index";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const base = { ...DEFAULT_CONFIG, nAgents: 50, agentReserve: 0 };

describe("venue table", () => {
  it("loads the world's venues and reserves spare slots", () => {
    const s = initState(world, { ...base, venueReserve: 5 }, 1);
    expect(s.nVenues).toBe(12);
    expect(s.venueEntity).toHaveLength(17);
    expect(Array.from(s.venueEntity.subarray(0, 12)).every((e) => world.entities[e].type === "place")).toBe(true);
    expect(Array.from(s.venueExpires.subarray(0, 12)).every((x) => x === -1)).toBe(true);
  });

  it("addVenue fills the next slot and refuses when full", () => {
    const s = initState(world, { ...base, venueReserve: 1 }, 1);
    const v = addVenue(s, 5, 3, 40);
    expect(v).toBe(12);
    expect(s.venueCell[v]).toBe(3);
    expect(s.venueCapacity[v]).toBe(40);
    expect(s.venueProfile[v * s.cw.nEntities + 5]).toBe(1);
    expect(s.venueOpen[v]).toBe(1);
    expect(addVenue(s, 6, 3, 40)).toBe(-1);
  });

  it("builds nearby lists of open permanent venues sorted by distance", () => {
    const s = initState(world, base, 1);
    s.venueOpen[0] = 0;
    const ev = addVenue(s, 5, 0, 40, 10, 5);
    const nearby = buildNearbyVenues(s);
    expect(nearby).toHaveLength(world.cells.length);
    for (let c = 0; c < nearby.length; c++) {
      const row = Array.from(nearby[c]);
      expect(row).not.toContain(0);
      expect(row).not.toContain(ev);
      const d = row.map((v) => distKm(s.cw, c, s.venueCell[v]));
      expect(d).toEqual([...d].sort((a, b) => a - b));
    }
  });

  it("lists active events only", () => {
    const s = initState(world, base, 1);
    const ev = addVenue(s, 5, 0, 40, 10, 5);
    expect(activeEvents(s)).toEqual([ev]);
    s.venueOpen[ev] = 0;
    expect(activeEvents(s)).toEqual([]);
  });

  it("reuses the slot of a closed expired event", () => {
    const s = initState(world, { ...base, venueReserve: 1 }, 1);
    const ev = addVenue(s, 5, 0, 40, 10, 5);
    expect(ev).toBe(12);
    s.venueOpen[ev] = 0;
    expect(addVenue(s, 6, 1, 40)).toBe(12);
    expect(s.venueExpires[12]).toBe(-1);
    expect(s.venueCell[12]).toBe(1);
    expect(s.nVenues).toBe(13);
  });

  it("never reuses a closed permanent venue", () => {
    const s = initState(world, { ...base, venueReserve: 0 }, 1);
    s.venueOpen[0] = 0;
    expect(addVenue(s, 5, 0, 40)).toBe(-1);
  });

  it("reports whether the table has room", () => {
    const s = initState(world, { ...base, venueReserve: 1 }, 1);
    expect(hasVenueRoom(s)).toBe(true);
    const ev = addVenue(s, 5, 0, 40, 10, 5);
    expect(hasVenueRoom(s)).toBe(false);
    s.venueOpen[ev] = 0;
    expect(hasVenueRoom(s)).toBe(true);
    const full = initState(world, { ...base, venueReserve: 0 }, 1);
    full.venueOpen[0] = 0;
    expect(hasVenueRoom(full)).toBe(false);
  });
});
