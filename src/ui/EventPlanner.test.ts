import { expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventPlanner } from "@/ui/EventPlanner";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

it("offers checkpoint scheduling with editable number inputs, without week navigation", () => {
  const html = renderToStaticMarkup(createElement(EventPlanner, {
    world: makeTinyWorld(), city: "test", frame: null, sceneTitle: String,
    compare: async () => { throw new Error("No worker in render test"); },
    schedule: async () => false, onPreview: () => {}, onCalendar: () => {},
  }));
  expect(html).toContain('aria-label="Event start checkpoint"');
  expect(html).not.toContain("Start week");
  expect(html).toContain("Playback stays paused");
});
