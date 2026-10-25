import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventCalendar } from "@/ui/EventCalendar";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { initState } from "@/sim/state";
import { DEFAULT_CONFIG } from "@/sim/config";
import { buildFrame } from "@/sim/frame";
import { step } from "@/sim/step";

it("shows scheduled events by checkpoint, with cancellation still available", () => {
  const world = makeTinyWorld();
  const state = initState(world, { ...DEFAULT_CONFIG, nAgents: 10, ticksPerWeek: 7 }, 1);
  step(state, [{ type: "scheduleEvent", entity: 5, cell: 0, duration: 1, capacity: 100, reachKm: 1, label: "Test Act", startTick: 14 }]);
  const { frame } = buildFrame(state, "main", 0, false, 0);
  const html = renderToStaticMarkup(createElement(EventCalendar, { world, frame, onCancel: () => {} }));
  expect(html).toContain("Test Act");
  expect(html).toContain("Checkpoint 14");
  expect(html).toContain("Cancel booking");
  expect(html).not.toContain("Week ");
});
