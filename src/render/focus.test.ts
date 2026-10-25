import { describe, expect, it } from "vitest";
import { agentInFocus, venueInFocus, experimentFocus, followExperiment, raceGroup, raceSeen, raceShortlistFocus, venueFocus } from "@/render/focus";
import type { Frame } from "@/sim/frame";

describe("focus", () => {
  it("keeps recent venue visitors highlighted after they leave, excluding unrelated residents", () => {
    const frame = { epoch: 1, ticksPerWeek: 2, nVenues: 2, venueCell: Int32Array.from([0, 1]), alive: Uint8Array.from([1, 1, 1]), attendance: Int32Array.from([-1, 1, -1]), attendanceHistory: Int32Array.from([0, -1, 1, 1, -1, -1]), homeCell: Int32Array.from([0, 0, 0]) } as Frame;
    const focus = venueFocus(frame, 0);
    expect(agentInFocus(focus, 3, -1, 0)).toBe(true);
    expect(agentInFocus(focus, 3, 1, 1)).toBe(false);
    expect(agentInFocus(focus, 3, -1, 2)).toBe(false);
    expect(experimentFocus(frame, [{ type: "closeVenue", venue: 0 }]).agents).toEqual(new Set([0]));
  });
  it("follows only a changed venue's observed visitors and their later destinations", () => {
    const frame = { epoch: 1, nVenues: 3, venueCell: Int32Array.from([0, 1, 2]), alive: Uint8Array.from([1, 1, 1]), attendance: Int32Array.from([0, 1, -1]), homeCell: Int32Array.from([0, 0, 0]) } as Frame;
    const cohort = experimentFocus(frame, [{ type: "closeVenue", venue: 0 }]);
    expect(agentInFocus(cohort, 4, -1, 0)).toBe(true);
    expect(agentInFocus(cohort, 4, 0, 1)).toBe(false);
    const next = { ...frame, attendance: Int32Array.from([2, 1, -1]) };
    const focus = followExperiment(cohort, next)!;
    expect(venueInFocus(focus, { slot: 2, dominantScene: 4 })).toBe(true);
    expect(venueInFocus(focus, { slot: 1, dominantScene: 4 })).toBe(false);
    expect(followExperiment(cohort, { ...next, epoch: 2 })).toBeNull();
  });
  it("colours each race candidate's recent visitors, then tonight's event visitors from race frames", () => {
    const frame = { epoch: 1, ticksPerWeek: 2, nVenues: 3, venueCell: Int32Array.from([0, 1, 2]), alive: Uint8Array.from([1, 1, 1, 1]), attendance: Int32Array.from([-1, -1, -1, -1]), attendanceHistory: Int32Array.from([0, 1, 0, -1, 2, -1, -1, -1]), homeCell: Int32Array.from([0, 0, 0, 0]) } as Frame;
    const focus = raceShortlistFocus(frame, [1, 0]);
    expect([...focus.groups]).toEqual([0, 1, -1, -1]); // agent 0 visited both: the first candidate (venue 1) wins
    expect(venueInFocus(focus, { slot: 0, dominantScene: -1 })).toBe(true);
    expect(venueInFocus(focus, { slot: 2, dominantScene: -1 })).toBe(false);
    const night = { ...frame, race: { hosts: [1, 0], group: Int8Array.from([-1, -1, -1, 1]), seen: Int8Array.from([0, -1, -1, 1]), tonight: [0, 1], total: [0, 1], night: 1, nights: 1 } };
    expect(raceGroup(focus, night, 3)).toBe(1);
    expect(raceGroup(focus, night, 0)).toBe(-1);
    expect(raceSeen(night, 0)).toBe(0); // went to A on an earlier night
    expect(raceSeen(frame, 0)).toBe(-1);
  });
  it("keeps everyone in focus when nothing is focused", () => {
    expect(agentInFocus(null, 3, -1)).toBe(true);
    expect(venueInFocus(null, { slot: 2, dominantScene: -1 })).toBe(true);
  });

  it("follows a scene's members and the venues it dominates", () => {
    const focus = { kind: "scene", id: 4 } as const;
    expect(agentInFocus(focus, 4, -1)).toBe(true);
    expect(agentInFocus(focus, 5, 2)).toBe(false);
    expect(venueInFocus(focus, { slot: 0, dominantScene: 4 })).toBe(true);
    expect(venueInFocus(focus, { slot: 1, dominantScene: 5 })).toBe(false);
  });

  it("follows a venue and its visitors this week", () => {
    const focus = { kind: "venue", slot: 2 } as const;
    expect(agentInFocus(focus, 9, 2)).toBe(true);
    expect(agentInFocus(focus, 9, 3)).toBe(false);
    expect(venueInFocus(focus, { slot: 2, dominantScene: 7 })).toBe(true);
    expect(venueInFocus(focus, { slot: 3, dominantScene: 7 })).toBe(false);
  });
});
