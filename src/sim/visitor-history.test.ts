import { expect, it } from "vitest";
import { initState, cloneState } from "./state";
import { DEFAULT_CONFIG } from "./config";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { tallyAttendance } from "./steps/attendance";
import { buildFrame } from "./frame";
import { addVenue } from "./venue-table";
import { Timeline } from "./timeline";
import { recentVenueVisitors } from "@/render/focus";

it("retains one activity cycle of per-resident outings, copies it, and expires older visits", () => {
  const s = initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 3, agentReserve: 0, ticksPerWeek: 2 }, 1);
  s.attendance.set([0, -1, 1]); tallyAttendance(s);
  s.tick = 1; s.attendance.fill(-1); tallyAttendance(s);
  const copy = cloneState(s);
  const { frame } = buildFrame(s, "main", 0, false, 1);
  expect([...frame.attendanceHistory!]).toEqual([0, -1, -1, -1, 1, -1]);
  s.tick = 2; tallyAttendance(s);
  expect([...s.attendanceHistory]).toEqual([-1, -1, -1, -1, -1, -1]);
  expect(copy.attendanceHistory[0]).toBe(0);
  expect(frame.attendanceHistory![0]).toBe(0);
});

it("does not attribute an expired event's visitors to the next venue occupying its slot", () => {
  const s = initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 3, agentReserve: 0, ticksPerWeek: 2 }, 1);
  const event = addVenue(s, 0, 0, 10, 1);
  s.attendance[0] = event; tallyAttendance(s);
  s.venueOpen[event] = 0;
  expect(addVenue(s, 0, 0, 10, 2)).toBe(event);
  expect([...s.attendanceHistory]).not.toContain(event);
  expect(s.attendance[0]).toBe(event); // retained for the expired event's final-turnout accounting
  s.tick = 1;
  const frame = buildFrame(s, "main", 0, false, 1).frame;
  expect(frame.attendance[0]).toBe(-1);
  expect(recentVenueVisitors(frame, new Set([event])).size).toBe(0);
});

it("reconstructs exactly the same visitor history after rewind", () => {
  const timeline = Timeline.create(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 30, ticksPerWeek: 7 }, 2);
  timeline.advance(3);
  const expected = timeline.state.attendanceHistory.slice();
  timeline.advance(5); timeline.rewind(3);
  expect(timeline.state.attendanceHistory).toEqual(expected);
});
