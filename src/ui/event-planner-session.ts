import type { BookingDate } from "@/sim/booking";
import type { Frame } from "@/sim/frame";
import type { ScheduledEvent } from "@/sim/scheduling";

export type PlannedBooking = {
  epoch: number;
  previousIds: number[];
  hostVenue: number;
  entity: number;
  label: string;
  startTick: number;
  durationDays?: number;
  title: string;
};

export function bookingStatus(booking: PlannedBooking, frame: Frame | null): ScheduledEvent["status"] | "missing" {
  if (!frame || frame.epoch !== booking.epoch) return "missing";
  const event = frame.scheduledEvents?.find((event) => !booking.previousIds.includes(event.id)
    && event.action.hostVenue === booking.hostVenue && event.action.entity === booking.entity
    && event.action.label === booking.label && event.startTick === booking.startTick
    && event.action.durationDays === booking.durationDays);
  return event?.status ?? "missing";
}

type PlanningTransition = { pause: () => void; finishCase: () => Promise<void>; clearView: () => void; open: () => void };

/** Finish the focused case before allowing a different explicit workflow to begin. */
export async function prepareEventPlanning(transition: PlanningTransition): Promise<void> {
  transition.pause();
  await transition.finishCase();
  transition.pause();
  transition.clearView();
  transition.open();
}

/** Keep input text editable, and accept complete bounded dates only at submission. */
export function eventDateFromInputs(checkpoint: string, nights: string, currentTick: number, ticksPerWeek: number): BookingDate | null {
  if (!checkpoint.trim() || !nights.trim()) return null;
  const startTick = Number(checkpoint), durationDays = Number(nights);
  if (!Number.isInteger(startTick) || startTick < currentTick || startTick > currentTick + 52 * ticksPerWeek || !Number.isInteger(durationDays) || durationDays < 1 || durationDays > 28) return null;
  return { startTick, ...(ticksPerWeek === 7 ? { durationDays } : {}) };
}
