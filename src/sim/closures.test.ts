import { describe, expect, it } from "vitest";
import { recordClosure, closureExplanation } from "@/sim/closures";
import { DEFAULT_CONFIG } from "@/sim/config";
import { cloneState, initState } from "@/sim/state";
import { buildFrame } from "@/sim/frame";
import { Timeline } from "@/sim/timeline";
import { addVenue } from "@/sim/venue-table";
import { updateVenues } from "@/sim/steps/venues";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const create = () => initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 10, ticksPerWeek: 7, graceTicks: 0, closeAfterTicks: 1, healthAlpha: 1 }, 1);
describe("closure explanations", () => {
  it("rewinds closure evidence and replays manual closures deterministically", () => {
    const t = Timeline.create(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 10 }, 1, 10);
    t.advance(2);
    t.queue({ type: "closeVenue", venue: 0 });
    t.advance(2);
    const evidence = structuredClone(t.state.closureEvents);
    expect(evidence[0]).toMatchObject({ venue: 0, reason: "manual", tick: 2 });
    t.advance(3);
    t.rewind(4);
    expect(t.state.closureEvents).toEqual(evidence);
    t.rewind(1);
    expect(t.state.closureEvents).toEqual([]);
    expect(t.state.venueClosures[0]).toBeNull();
  });
  it("records manual closure once without mutating clones and explains the cause", () => {
    const s = create();
    s.venueWeekVisits[0] = 17;
    const c = recordClosure(s, 0, "manual")!;
    expect(c.weeklyVisits).toBe(17);
    expect(recordClosure(s, 0, "manual")).toBeNull();
    expect(s.closureEvents).toHaveLength(1);
    expect(closureExplanation(c)).toBe("Closed by your intervention.");
    expect(closureExplanation({ ...c, reason: "event_expired" })).toContain("scheduled end");
    expect(closureExplanation({ ...c, reason: "poor_health", lowWeeks: 2 })).toContain("17 visits");
    const copy = cloneState(s);
    copy.venueClosures[0]!.weeklyVisits = 999;
    expect(c.weeklyVisits).toBe(17);
  });
  it("records actual rolling visits and rent-adjusted capacity at poor-health closure", () => {
    const s = create();
    s.cellRent[s.venueCell[0]] = 2;
    s.venueAttendance[0] = 1;
    for (let t = 0; t < 7; t++) { s.tick = t; updateVenues(s); }
    expect(s.venueClosures?.[0]).toMatchObject({ reason: "poor_health", tick: 6, weeklyVisits: 7, effectiveCapacity: s.venueCapacity[0] * 2, rent: 2, lowTicks: 7, lowWeeks: 1 });
  });
  it("preserves event history through slot reuse and clone/frame isolation", () => {
    const s = create();
    const v = addVenue(s, 0, 0, 100, 1);
    s.venueAttendance[v] = 12;
    updateVenues(s);
    expect(s.venueClosures?.[v]).toMatchObject({ reason: "event_expired", weeklyVisits: 12 });
    const copy = cloneState(s);
    const { frame } = buildFrame(s, "main", 0, false, 0);
    expect(addVenue(copy, 1, 0, 100, 3)).toBe(v);
    expect(copy.venueClosures[v]).toBeNull();
    expect(s.venueClosures[v]?.reason).toBe("event_expired");
    expect(copy.closureEvents).toHaveLength(1);
    frame.closureEvents![0].weeklyVisits = 99;
    expect(s.closureEvents[0].weeklyVisits).toBe(12);
  });
});
