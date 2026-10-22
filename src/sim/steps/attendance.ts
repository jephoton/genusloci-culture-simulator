import type { SimState } from "@/sim/state";

/** Attendees grouped by venue: venue v's agents are members[offsets[v]..offsets[v+1]). */
export type Roster = { offsets: Int32Array; members: Int32Array };

/** Sets s.venueAttendance from s.attendance and returns the attendee roster. */
export function tallyAttendance(s: SimState): Roster {
  const cycle = s.config.ticksPerWeek;
  const cursorTick = s.tick % cycle;
  for (let a = 0; a < s.alive.length; a++) s.attendanceHistory[a * cycle + cursorTick] = s.alive[a] ? s.attendance[a] : -1;
  const nV = s.nVenues;
  const counts = s.venueAttendance;
  counts.fill(0);
  for (const v of s.attendance) if (v >= 0) counts[v]++;
  const offsets = new Int32Array(nV + 1);
  for (let v = 0; v < nV; v++) offsets[v + 1] = offsets[v] + counts[v];
  const cursor = offsets.slice(0, nV);
  const members = new Int32Array(offsets[nV]);
  s.attendance.forEach((v, i) => {
    if (v >= 0) members[cursor[v]++] = i;
  });
  return { offsets, members };
}
