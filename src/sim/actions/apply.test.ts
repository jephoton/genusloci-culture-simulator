import { describe, expect, it } from "vitest";
import { applyAction, MAX_RENT, validateAction } from "@/sim/actions/apply";
import { DEFAULT_CONFIG } from "@/sim/config";
import { GENOME_CAP } from "@/sim/genome";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { updateVenues } from "@/sim/steps/venues";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const idx = (c: number, j: number) => c * 12 + j;
const base = { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 100, autoOpen: false };
const fresh = (overrides = {}) => initState(world, { ...base, ...overrides }, 1);
const rng = () => createRng(99);

describe("closeVenue", () => {
  it("closes the venue and removes it from nearby lists", () => {
    const s = fresh();
    expect(applyAction(s, { type: "closeVenue", venue: 2 }, rng())).toEqual({ ok: true, venue: 2 });
    expect(s.venueOpen[2]).toBe(0);
    s.nearbyVenues.forEach((row) => expect(Array.from(row)).not.toContain(2));
  });

  it("rejects unknown or already-closed venues without changing anything", () => {
    const s = fresh();
    expect(applyAction(s, { type: "closeVenue", venue: 99 }, rng()).ok).toBe(false);
    applyAction(s, { type: "closeVenue", venue: 2 }, rng());
    expect(validateAction(s, { type: "closeVenue", venue: 2 })).toMatch(/already closed/);
  });
});

describe("openVenue", () => {
  it("adds a venue at the cell with the entity's profile", () => {
    const s = fresh();
    const r = applyAction(s, { type: "openVenue", entity: idx(1, 5), cell: 3, capacity: 80 }, rng());
    expect(r).toEqual({ ok: true, venue: 12 });
    expect(s.nVenues).toBe(13);
    expect(s.venueCell[12]).toBe(3);
    expect(s.venueCapacity[12]).toBe(80);
    expect(s.venueProfile[12 * s.cw.nEntities + idx(1, 5)]).toBe(1);
    expect(Array.from(s.nearbyVenues[3])).toContain(12);
  });

  it("rejects bad indices and a full venue table", () => {
    const s = fresh({ venueReserve: 0 });
    expect(validateAction(s, { type: "openVenue", entity: 999, cell: 0 })).toMatch(/entity/);
    expect(validateAction(s, { type: "openVenue", entity: 1, cell: 99 })).toMatch(/cell/);
    expect(validateAction(s, { type: "openVenue", entity: 1, cell: 0 })).toMatch(/slots/);
  });
});

describe("scheduleEvent", () => {
  const event = { type: "scheduleEvent", entity: idx(0, 5), cell: 0, duration: 2, reachKm: 50, capacity: 1e6 } as const;

  it("draws agents from across the city and expires after its duration", () => {
    const s = fresh();
    const r = step(s, [event]);
    expect(r[0].ok).toBe(true);
    const ev = 12;
    const homes = new Set<number>();
    s.attendance.forEach((v, i) => {
      if (v === ev) homes.add(s.homeCell[i]);
    });
    expect(homes.size).toBeGreaterThanOrEqual(3);
    expect(s.venueOpen[ev]).toBe(1);
    step(s);
    expect(s.venueOpen[ev]).toBe(0);
  });

  it("is limited by maxEvents", () => {
    const s = fresh({ maxEvents: 1 });
    expect(applyAction(s, event, rng()).ok).toBe(true);
    expect(validateAction(s, event)).toMatch(/events/);
  });
});

describe("migrate", () => {
  const genes = [{ entity: idx(2, 6), weight: 1 }, { entity: idx(2, 7), weight: 0.8 }];

  it("brings new agents with the given tastes and gives them friends", () => {
    const s = fresh();
    const r = applyAction(s, { type: "migrate", count: 40, cells: [5, 6], genes }, rng());
    expect(r).toEqual({ ok: true, agents: 40 });
    expect(Array.from(s.alive).filter((x) => x === 1)).toHaveLength(340);
    for (let i = 300; i < 340; i++) {
      expect([5, 6]).toContain(s.homeCell[i]);
      const ids = Array.from(s.genomes.ids.subarray(i * GENOME_CAP, (i + 1) * GENOME_CAP)).filter((x) => x >= 0);
      expect(ids.every((e) => e === idx(2, 6) || e === idx(2, 7))).toBe(true);
      expect(s.friends[i * s.config.friendsPerAgent]).toBeGreaterThanOrEqual(0);
    }
  });

  it("rejects more migrants than free slots", () => {
    const s = fresh();
    expect(validateAction(s, { type: "migrate", count: 101, cells: [0], genes })).toMatch(/free agent slots/);
  });
});

describe("rentPressure", () => {
  it("raises rent (capped) and makes venues there lose health faster", () => {
    const s = fresh();
    const a = 0;
    const b = Array.from({ length: s.nVenues }, (_, v) => v).find((v) => s.venueCell[v] !== s.venueCell[a]) as number;
    applyAction(s, { type: "rentPressure", cells: [s.venueCell[a]], magnitude: 1 }, rng());
    expect(s.cellRent[s.venueCell[a]]).toBe(2);
    s.venueAttendance.fill(0);
    s.venueAttendance[a] = 25;
    s.venueAttendance[b] = 25;
    updateVenues(s);
    expect(s.venueHealth[a]).toBeLessThan(s.venueHealth[b]);
    for (let k = 0; k < 5; k++) applyAction(s, { type: "rentPressure", cells: [s.venueCell[a]], magnitude: 4 }, rng());
    expect(s.cellRent[s.venueCell[a]]).toBe(MAX_RENT);
  });
});

describe("step with actions", () => {
  it("returns a result per action and logs only successful ones at the current tick", () => {
    const s = fresh();
    step(s);
    const results = step(s, [{ type: "closeVenue", venue: 1 }, { type: "closeVenue", venue: 99 }]);
    expect(results.map((r) => r.ok)).toEqual([true, false]);
    expect(s.log).toEqual([{ tick: 1, action: { type: "closeVenue", venue: 1 } }]);
  });
});
