import { describe, expect, it } from "vitest";
import { CaseMonitor } from "@/sim/case";
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

function setup(agents = [0, 1]) {
  const s = initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 10, agentReserve: 0, ticksPerWeek: 7 });
  const monitor = new CaseMonitor(s, { id: "case-1", startTick: 0, maxTicks: 40, venueSlots: [0], agentSlots: agents });
  const tick = (visitors = true) => {
    s.tick++;
    s.attendance.fill(-1);
    if (visitors) { s.attendance[0] = 0; s.attendance[1] = 0; }
    return monitor.observe(s);
  };
  return { s, monitor, tick };
}

describe("CaseMonitor", () => {
  it.each(["scheduled", "started"] as const)("does not infer settling while a relevant event is %s", (status) => {
    const { s } = setup();
    s.scheduledEvents.push({ id: 1, startTick: 30, status, action: { type: "scheduleEvent", entity: 5, cell: 0, duration: 1, reachKm: 1, capacity: 100 } });
    const monitor = new CaseMonitor(s, { id: "pending", startTick: 0, maxTicks: 56, venueSlots: [], agentSlots: [0], locations: [{ entity: 5, cell: 0 }] });
    for (let i = 1; i <= 56; i++) {
      s.tick++; s.attendance.fill(-1); s.attendance[0] = 0;
      expect(monitor.observe(s)).toBe(i === 56 ? "limit" : null);
    }
  });
  it.each(["completed", "cancelled"] as const)("allows fresh stable comparisons after the relevant event is %s", (status) => {
    const { s } = setup();
    s.scheduledEvents.push({ id: 1, startTick: 30, status: "scheduled", action: { type: "scheduleEvent", entity: 5, cell: 0, duration: 1, reachKm: 1, capacity: 100 } });
    const monitor = new CaseMonitor(s, { id: "resolved", startTick: 0, maxTicks: 84, venueSlots: [], agentSlots: [0], locations: [{ entity: 5, cell: 0 }] });
    for (let i = 1; i <= 49; i++) {
      if (i === 22) s.scheduledEvents[0].status = status;
      s.tick++; s.attendance.fill(-1); s.attendance[0] = 0;
      expect(monitor.observe(s)).toBe(i === 49 ? "settled" : null);
    }
  });
  it("discovers an immediately opened venue by location beyond the original focus slots", () => {
    const { s } = setup();
    const venue = s.nVenues++;
    s.venueEntity[venue] = 5; s.venueCell[venue] = 0; s.venueOpen[venue] = 1;
    const monitor = new CaseMonitor(s, { id: "opened", startTick: 0, maxTicks: 10, venueSlots: [], agentSlots: [0], locations: [{ entity: 5, cell: 0 }] });
    s.tick++; s.attendance.fill(-1); s.attendance[0] = venue;
    monitor.observe(s);
    expect(monitor.report(s, "finished")).toMatchObject({ visits: 1, venues: [{ venue, entity: 5, cell: 0, visits: 1 }] });
  });
  it("does not duplicate a venue matched by both explicit slots and locations", () => {
    const { s } = setup();
    const monitor = new CaseMonitor(s, { id: "same", startTick: 0, maxTicks: 4, venueSlots: [0], agentSlots: [0], locations: [{ entity: s.venueEntity[0], cell: s.venueCell[0] }, { entity: s.venueEntity[0], cell: s.venueCell[0] }] });
    for (let i = 0; i < 3; i++) { s.tick++; s.attendance.fill(-1); s.attendance[0] = 0; monitor.observe(s); }
    expect(monitor.report(s, "finished").venues.filter((v) => v.venue === 0)).toHaveLength(1);
    expect(monitor.report(s, "finished").visits).toBe(3);
  });
  it("discovers delayed matching appearances and counts each reused slot lifetime separately", () => {
    const { s } = setup();
    const monitor = new CaseMonitor(s, { id: "later", startTick: 0, maxTicks: 10, venueSlots: [], agentSlots: [0], locations: [{ entity: 5, cell: 0 }] });
    s.tick++; s.attendance.fill(-1); monitor.observe(s);
    const venue = s.nVenues++;
    s.venueEntity[venue] = 5; s.venueCell[venue] = 0; s.venueOpen[venue] = 1; s.venueExpires[venue] = 4;
    s.tick++; s.attendance[0] = venue; monitor.observe(s);
    s.tick++; s.venueOpen[venue] = 0; s.attendance.fill(-1); monitor.observe(s);
    s.tick++; s.venueOpen[venue] = 1; s.venueExpires[venue] = 8; s.attendance[0] = venue; monitor.observe(s);
    s.tick++; monitor.observe(s);
    const report = monitor.report(s, "finished");
    expect(report.visits).toBe(3);
    expect(report.venues.map((v) => v.visits)).toEqual([1, 2]);
    expect(report.venues.map((v) => v.openAfter)).toEqual([false, true]);
  });
  it("validates location bounds and limits", () => {
    const { s, monitor } = setup();
    for (const locations of [[{ entity: -1, cell: 0 }], [{ entity: 0, cell: s.cw.nCells }], Array(6).fill({ entity: 0, cell: 0 })]) {
      expect(() => new CaseMonitor(s, { ...monitor.spec, locations })).toThrow();
    }
  });
  it("counts actual outings once per observed tick and distinct visitors", () => {
    const { s, monitor, tick } = setup();
    tick(); tick(false); tick();
    expect(monitor.report(s, "finished")).toMatchObject({ observedTicks: 3, visits: 4, uniqueVisitors: 2, cohortOutings: 4, settledHeuristic: false });
    expect(monitor.report(s, "finished").venues[0].visits).toBe(4);
  });
  it("requires three complete cycles with two stable comparisons, never a quiet night", () => {
    const { tick } = setup();
    for (let i = 0; i < 20; i++) expect(tick()).toBeNull();
    expect(tick()).toBe("settled");
  });
  it("cannot infer settling with an empty cohort or no outings", () => {
    for (const agents of [[], [0]]) {
      const { tick } = setup(agents);
      for (let i = 0; i < 39; i++) expect(tick(false)).toBeNull();
      expect(tick(false)).toBe("limit");
    }
  });
  it("retires replaced venue slots and does not attribute their visitors", () => {
    const { s, monitor, tick } = setup();
    tick();
    s.venueEntity[0]++;
    tick();
    expect(monitor.report(s, "finished").visits).toBe(2);
    expect(monitor.report(s, "finished").venues[0].openAfter).toBe(false);
  });
  it("does not settle across alternating busy and quiet cycles", () => {
    const { tick } = setup();
    for (let i = 0; i < 39; i++) expect(tick(Math.floor(i / 7) % 2 === 0)).toBeNull();
    expect(tick(false)).toBe("limit");
  });
  it("restarts stable comparisons after a structural change within a cycle", () => {
    const { s, tick } = setup();
    for (let i = 0; i < 14; i++) expect(tick()).toBeNull();
    s.venueOpen[1] = 0;
    for (let i = 0; i < 21; i++) expect(tick()).toBeNull();
    for (let i = 0; i < 4; i++) expect(tick()).toBeNull();
    expect(tick()).toBe("limit");
  });
  it("excludes attendance already present when observation starts", () => {
    const { s } = setup();
    s.tick = 1; s.attendance[0] = 0;
    const monitor = new CaseMonitor(s, { id: "applied", startTick: 0, maxTicks: 2, venueSlots: [0], agentSlots: [0] });
    expect(monitor.report(s, "finished").visits).toBe(0);
    s.tick++; s.attendance.fill(-1);
    expect(monitor.observe(s)).toBe("limit");
    expect(monitor.report(s, "limit").observedTicks).toBe(1);
  });
  it("never counts a closed event slot after identical identity is reopened", () => {
    const { s, monitor } = setup();
    s.venueExpires[0] = 10;
    // A fresh monitor captures the event identity.
    const event = new CaseMonitor(s, { ...monitor.spec });
    s.tick++; s.attendance.fill(-1); s.venueOpen[0] = 0;
    event.observe(s);
    s.tick++; s.venueOpen[0] = 1; s.attendance[0] = 0;
    event.observe(s);
    expect(event.report(s, "finished").visits).toBe(0);
    expect(event.report(s, "finished").venues[0].openAfter).toBe(false);
  });
  it("does not settle when equal outing totals keep switching destinations", () => {
    const { s } = setup();
    const monitor = new CaseMonitor(s, { id: "moving", startTick: 0, maxTicks: 40, venueSlots: [], agentSlots: [0, 1] });
    for (let i = 0; i < 40; i++) {
      s.tick++;
      s.attendance.fill(-1);
      s.attendance[0] = s.attendance[1] = Math.floor(i / 7) % 2;
      expect(monitor.observe(s)).toBe(i === 39 ? "limit" : null);
    }
  });
  it("validates ids, duplicate slots, bounds and elapsed duration", () => {
    const { s } = setup();
    const spec = { id: "x", startTick: 0, maxTicks: 4, venueSlots: [0], agentSlots: [0] };
    for (const invalid of [{ id: "" }, { maxTicks: 0 }, { startTick: 1 }, { venueSlots: [999] }, { agentSlots: [0, 0] }]) {
      expect(() => new CaseMonitor(s, { ...spec, ...invalid })).toThrow();
    }
    s.tick = 4;
    expect(new CaseMonitor(s, spec).completion(s)).toBe("limit");
  });
});
