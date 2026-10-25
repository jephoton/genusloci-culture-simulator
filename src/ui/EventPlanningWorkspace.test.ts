import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventPlanningWorkspace } from "@/ui/EventPlanningWorkspace";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { initState } from "@/sim/state";
import { DEFAULT_CONFIG } from "@/sim/config";
import { buildFrame } from "@/sim/frame";

it("offers a visible planner with calendar access and a return to the preserved chat", () => {
  const world = makeTinyWorld();
  const { frame } = buildFrame(initState(world, { ...DEFAULT_CONFIG, nAgents: 10 }, 1), "main", 0, false, 0);
  const html = renderToStaticMarkup(createElement(EventPlanningWorkspace, {
    world, city: "test", frame, sceneTitle: String, view: "calendar", onView: () => {}, onClose: () => {}, onCancel: () => {},
    compare: async () => { throw new Error("No worker in render test"); }, schedule: async () => false, onPreview: () => {},
  }));
  expect(html).toContain('aria-label="Event planner workspace"');
  expect(html).toContain("Return to experiment chat");
  expect(html).toContain("Event calendar");
  expect(html).toContain("No events scheduled yet");
  expect(html).toContain('aria-label="Event planning"');
});
