import { expect, it } from "vitest";
import { createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { LabChat } from "@/ui/LabChat";

const props: ComponentProps<typeof LabChat> = {
  city: "Test City", citySlug: "test", cities: [{ slug: "test", name: "Test City" }], onCityChange: () => {},
  deps: {} as ComponentProps<typeof LabChat>["deps"],
  ai: { status: "ready", messages: [], cooldownUntil: 0 } as unknown as ComponentProps<typeof LabChat>["ai"],
  configured: false, frame: null, qlooGrounded: false, onPause: () => {}, onRewind: async () => false, onFocusVenue: () => {},
  onPlanning: () => {},
};

it("keeps the planner and calendar entry visible while suppressing the chat body in planning mode", () => {
  const chat = renderToStaticMarkup(createElement(LabChat, props));
  expect(chat).toContain('aria-label="Experiment chat"');
  const planning = renderToStaticMarkup(createElement(LabChat, { ...props, planning: true }));
  expect(planning).toContain("Plan an event");
  expect(planning).toContain("Event calendar");
  expect(planning).not.toContain('aria-label="Experiment chat"');
  expect(planning).not.toContain("Open experiment chat");
});
