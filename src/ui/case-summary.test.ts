import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { TimelineBar } from "./TimelineBar";
import { VenueInspection } from "./VenueInspection";
import { caseSummary } from "./case-summary";
import type { CaseReport } from "@/sim/case";
import type { Frame } from "@/sim/frame";

it("renders venue name and model health without a calendar label", () => {
  const world = makeTinyWorld();
  const frame = { nVenues: 1, venueEntity: Int32Array.from([0]), venueHealth: Float32Array.from([0.75]), venueOpen: Uint8Array.from([1]), venueAttendance: Int32Array.from([4]), alive: Uint8Array.from([1, 1]), attendance: Int32Array.from([0, -1]), venueScene: Int32Array.from([2]) } as Frame;
  const html = renderToStaticMarkup(createElement(VenueInspection, { world, frame, slot: 0, onClose: () => {} }));
  expect(html).toContain(world.entities[0].name);
  expect(html).toContain("75%");
  expect(html).toContain("4");
  expect(html).toContain("1 distinct visitors");
  expect(html).toContain("Scene 2");
});

it("shows playback and named rewind history instead of weeks/dates", () => {
  const html = renderToStaticMarkup(createElement(TimelineBar, { tick: 12, ticksPerWeek: 7, earliest: 0, playing: false, speed: 1, onPlay: () => {}, onPause: () => {}, onSpeed: () => {}, onRewind: () => {}, changes: [{ id: "a", label: "Close Alpha Club", tick: 3, status: "Observation complete" }] }));
  expect(html).toContain("Simulation playback");
  expect(html).toContain("Close Alpha Club");
  expect(html).not.toMatch(/week|Monday|Tuesday/i);
});

it("labels stopped observations without claiming all effects ended or causal differences", () => {
  const report: CaseReport = { id: "a", startTick: 2, endTick: 10, reason: "limit", observedTicks: 7, visits: 14, uniqueVisitors: 8, cohortOutings: 20, venues: [], settledHeuristic: false };
  const text = caseSummary(report, "Close Alpha", makeTinyWorld());
  expect(text).toContain("observation limit");
  expect(text).toContain("does not mean every effect has ended");
  expect(text).toContain("change step is excluded");
  expect(text).not.toMatch(/week/i);
});
