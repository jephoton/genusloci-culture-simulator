import { expect, it } from "vitest";
import { bookingStatus, type PlannedBooking } from "@/ui/event-planner-session";
import { DEFAULT_CONFIG } from "@/sim/config";
import { Timeline } from "@/sim/timeline";
import { buildFrame } from "@/sim/frame";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { EventBookingConfirmation } from "@/ui/EventPlanner";
import type { Frame } from "@/sim/frame";

const event = { type: "scheduleEvent" as const, entity: 5, cell: 0, hostVenue: 0, duration: 1, durationDays: 1, reachKm: 2, capacity: 100, startTick: 5, label: "Friday act" };
const receipt: PlannedBooking = { epoch: 0, previousIds: [], hostVenue: 0, entity: 5, label: "Friday act", startTick: 5, durationDays: 1, title: "Friday act at host" };
const create = () => Timeline.create(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 100, ticksPerWeek: 7, autoOpen: false }, 4);
const confirmation = (frame: Frame) => renderToStaticMarkup(createElement(EventBookingConfirmation, { booking: receipt, frame, onCalendar: () => {}, onEdit: () => {} }));

it("replaces scheduled confirmation after cancelling the booking through the calendar", () => {
  const timeline = create();
  timeline.queue(event); timeline.advance(1);
  expect(bookingStatus(receipt, buildFrame(timeline.state, "main", 0, false, 0).frame)).toBe("scheduled");
  expect(confirmation(buildFrame(timeline.state, "main", 0, false, 0).frame)).toContain("Scheduled in the simulation");
  timeline.queue({ type: "cancelEvent", event: timeline.state.scheduledEvents[0].id }); timeline.advance(1);
  expect(bookingStatus(receipt, buildFrame(timeline.state, "main", 0, false, 0).frame)).toBe("cancelled");
  const cancelled = confirmation(buildFrame(timeline.state, "main", 0, false, 0).frame);
  expect(cancelled).toContain("Booking cancelled");
  expect(cancelled).not.toContain("The event is now on the city calendar");
});

it("does not confirm a deleted or reused booking after rewind", () => {
  const timeline = create();
  timeline.advance(1); timeline.queue(event); timeline.advance(1);
  expect(bookingStatus(receipt, buildFrame(timeline.state, "main", 0, false, 0).frame)).toBe("scheduled");
  timeline.rewind(0);
  expect(bookingStatus(receipt, buildFrame(timeline.state, "main", 0, false, 1).frame)).toBe("missing");
  const rewound = confirmation(buildFrame(timeline.state, "main", 0, false, 1).frame);
  expect(rewound).toContain("Booking no longer on this timeline");
  expect(rewound).not.toContain("Scheduled in the simulation");
  timeline.queue(event); timeline.advance(1);
  expect(bookingStatus(receipt, buildFrame(timeline.state, "main", 0, false, 1).frame)).toBe("missing");
});

it("does not mistake an older identical event for a newly accepted booking", () => {
  const timeline = create(); timeline.queue(event); timeline.advance(1);
  expect(bookingStatus({ ...receipt, previousIds: [timeline.state.scheduledEvents[0].id] }, buildFrame(timeline.state, "main", 0, false, 0).frame)).toBe("missing");
});
