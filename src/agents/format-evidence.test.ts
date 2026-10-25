import { describe, expect, it } from "vitest";
import { formatEvidence } from "./format-evidence";

describe("deterministic evidence summaries", () => {
  it("preserves the recorded baseline, totals and consistency without a business forecast", () => {
    const text = formatEvidence({ weeks: 4, runs: 3, actionsApplied: ["ok"], biggestLosers: [{ venue: "Alpha", withoutChange: 120, withChange: 80, change: "-40 (range -55 to -25)", verdict: "clear" }], scenes: [] });
    expect(text).toContain("120 → 80 modeled visits");
    expect(text).toContain("-55 to -25");
    expect(text).toContain("not unique people or ticket sales");
  });
  it("does not expose fidelity as user-facing confidence", () => {
    const text = formatEvidence({ city: "Test", residents: 100, week: 1, tick: 7, fidelity: 0.8, scenes: [] });
    expect(text).not.toContain("0.8");
    expect(text).toContain("No scenes");
    expect(text).not.toMatch(/week|day|date/i);
  });
  it("describes venue activity without calendar labels", () => {
    const ranking = formatEvidence({ sort: "busiest", venues: [{ name: "Alpha", weeklyVisits: 12, health: 0.5 }] });
    const venue = formatEvidence({ venue: 0, name: "Alpha", open: true, visitorsTonight: 3, weeklyVisits: 12 });
    expect(ranking).toContain("12 visits in the recent activity cycle");
    expect(venue).toContain("3 visits this step");
    expect(`${ranking}\n${venue}`).not.toMatch(/week|tonight/i);
  });
  it("reports rejection rather than claiming successful mutation", () => {
    expect(formatEvidence({ applied: ["rejected by the simulation"] })).toContain("rejected");
  });
});
