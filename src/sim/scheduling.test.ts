import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { cloneState } from "@/sim/state";
import { Timeline } from "@/sim/timeline";
import { parseAction } from "@/sim/actions/schema";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const create = () => Timeline.create(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 100, ticksPerWeek: 7, autoOpen: false }, 4);
const event = { type: "scheduleEvent" as const, entity: 5, cell: 0, duration: 1, durationDays: 1, reachKm: 2, capacity: 100, startTick: 5, label: "Friday act" };

describe("dated events", () => {
  it("waits for the date, opens for one night, and preserves the artist label", () => {
    const t = create();
    t.queue(event);
    t.advance(1);
    expect(t.state.scheduledEvents[0]).toMatchObject({ status: "scheduled", startTick: 5 });
    const n = t.state.nVenues;
    t.advance(4);
    expect(t.state.nVenues).toBe(n);
    t.advance(1);
    expect(t.state.scheduledEvents[0]).toMatchObject({ status: "completed", venue: n });
    expect(t.state.venueExpires[n]).toBe(6);
    expect(t.state.venueOpen[n]).toBe(0);
  });
  it("clones, forks and rewinds the calendar without leaking mutations", () => {
    const t = create();
    t.queue(event); t.advance(2);
    const copy = cloneState(t.state);
    const fork = t.fork();
    fork.queue({ type: "cancelEvent", event: 0 }); fork.advance(1);
    expect(t.state.scheduledEvents[0].status).toBe("scheduled");
    expect(copy.scheduledEvents[0].status).toBe("scheduled");
    t.advance(5); t.rewind(3);
    expect(t.state.scheduledEvents[0].status).toBe("scheduled");
    t.advance(3);
    expect(t.state.scheduledEvents[0].status).toBe("completed");
  });
  it("records start failures instead of silently booking an impossible event", () => {
    const t = create();
    t.queue(event); t.advance(1);
    t.state.config.maxEvents = 0;
    t.advance(5);
    expect(t.state.scheduledEvents[0]).toMatchObject({ status: "failed", error: "too many active events" });
  });
  it("rejects past or unbounded dates and invalid day lengths", () => {
    const t = create(); t.advance(2);
    expect(t.queue({ ...event, startTick: 1 })).toMatch(/past/);
    expect(t.queue({ ...event, startTick: 10000 })).toMatch(/52 weeks/);
    expect(() => parseAction({ ...event, durationDays: 0 })).toThrow();
    expect(parseAction(event)).toMatchObject({ startTick: 5, durationDays: 1, label: "Friday act" });
  });
  it("owns queued actions so callers cannot mutate a future booking", () => {
    const t = create(); const a = { ...event };
    t.queue(a); a.startTick = 99; t.advance(1);
    expect(t.state.scheduledEvents[0].startTick).toBe(5);
  });
  it("completes a booking before its closed slot can be reused in the same batch", () => {
    const t = create();
    t.queue({ ...event, startTick: 0, durationDays: 7 }); t.advance(1);
    const slot = t.state.scheduledEvents[0].venue!;
    t.queue({ type: "closeVenue", venue: slot });
    t.queue({ ...event, startTick: undefined, durationDays: 7 }); t.advance(1);
    expect(t.state.scheduledEvents[0].status).toBe("completed");
    expect(t.queue({ type: "cancelEvent", event: 0 })).toMatch(/not scheduled/);
  });
});
