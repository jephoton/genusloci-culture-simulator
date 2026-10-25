import { expect, it } from "vitest";
import { prepareEventPlanning, eventDateFromInputs } from "@/ui/event-planner-session";

it("waits for case exit before clearing the old view and opening the paused planner", async () => {
  const events: string[] = [];
  let release!: () => void;
  const completed = new Promise<void>((resolve) => { release = resolve; });
  const preparing = prepareEventPlanning({
    pause: () => { events.push("pause"); },
    finishCase: async () => { events.push("finish"); await completed; },
    clearView: () => { events.push("clear"); },
    open: () => { events.push("open"); },
  });
  expect(events).toEqual(["pause", "finish"]);
  release(); await preparing;
  expect(events).toEqual(["pause", "finish", "pause", "clear", "open"]);
});

it("does not open or clear a case view when case exit fails", async () => {
  const events: string[] = [];
  await expect(prepareEventPlanning({ pause: () => {}, finishCase: async () => { throw new Error("exit failed"); }, clearView: () => { events.push("clear"); }, open: () => { events.push("open"); } })).rejects.toThrow("exit failed");
  expect(events).toEqual([]);
});

it("rejects empty, past, fractional and out of range scheduling inputs", () => {
  for (const [checkpoint, nights] of [["", "1"], ["   ", "1"], ["9", "1"], ["10.5", "1"], ["375", "1"], ["10", ""], ["10", "0"], ["10", "29"]]) {
    expect(eventDateFromInputs(checkpoint, nights, 10, 7)).toBeNull();
  }
  expect(eventDateFromInputs("14", "2", 10, 7)).toEqual({ startTick: 14, durationDays: 2 });
  expect(eventDateFromInputs("10", "1", 10, 1)).toEqual({ startTick: 10 });
});
