import { expect, it } from "vitest";
import { applyAction } from "@/sim/actions/apply";
import { DEFAULT_CONFIG } from "@/sim/config";
import { runEventCandidates } from "@/sim/events";
import { createRng } from "@/sim/rng";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const fresh = () => initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 400, agentReserve: 0, autoOpen: false, maxEvents: 1 }, 3);
const options = { weeks: 4, duration: 3, reachKm: 25, capacity: 3000, nearbyKm: 1, runs: 1 };
const candidate = { entity: 5, cell: 0 };

it("reports paired location totals and turnout range without changing the live state", () => {
  const s = fresh();
  const tick = s.tick;
  const [r] = runEventCandidates(s, [candidate], { ...options, hostVenue: 0, runs: 3 });
  expect(r.hostWithEvent).toBeCloseTo(r.hostBaseline! + r.hostChange + r.turnout);
  expect(r.turnoutRange!.min).toBeLessThanOrEqual(r.turnout);
  expect(r.turnoutRange!.max).toBeGreaterThanOrEqual(r.turnout);
  expect(s.tick).toBe(tick);
  expect(s.scheduledEvents).toHaveLength(0);
});

it("preserves earlier bookings' priority when a dated candidate competes for the last event slot", () => {
  const s = fresh();
  const startTick = s.tick + 2;
  applyAction(s, { type: "scheduleEvent", ...candidate, duration: 3, reachKm: 25, capacity: 3000, startTick }, createRng(s.rngState));
  expect(() => runEventCandidates(s, [candidate], { ...options, startTick })).toThrow(/too many active events/);
  expect(s.scheduledEvents).toHaveLength(1);
  expect(s.tick).toBe(0);
});

it("counts the candidate's final tick but excludes a later booking reusing its expired slot", () => {
  const s = fresh();
  step(s);
  applyAction(s, { type: "scheduleEvent", ...candidate, duration: 3, reachKm: 25, capacity: 3000, startTick: s.tick + 3 }, createRng(s.rngState));
  const [two] = runEventCandidates(s, [candidate], { ...options, weeks: 2 });
  const [three] = runEventCandidates(s, [candidate], { ...options, weeks: 3 });
  const [four] = runEventCandidates(s, [candidate], options);
  expect(three.turnout).toBeGreaterThan(two.turnout);
  expect(four.turnout).toBe(three.turnout);
  expect(four.scenes).toEqual(three.scenes);
});

it("retains final attendance when auto-opening a permanent venue reuses the slot during expiry", () => {
  const s = fresh();
  const [withoutReuse] = runEventCandidates(s, [candidate], { ...options, duration: 1, weeks: 1 });
  s.config = { ...s.config, autoOpen: true, autoOpenScore: 0, sceneEvery: 1 };
  const [withReuse] = runEventCandidates(s, [candidate], { ...options, duration: 1, weeks: 1 });
  expect(withoutReuse.turnout).toBeGreaterThan(0);
  expect(withReuse.turnout).toBe(withoutReuse.turnout);
});
