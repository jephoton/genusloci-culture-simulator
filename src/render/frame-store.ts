import type { SimClock } from "@/render/clock";
import type { Frame } from "@/sim/frame";

/**
 * Latest and previous frames, held in a ref so per-frame animation doesn't re-render React, plus the
 * animation clock every renderer reads (it only runs while the simulation plays). `receivedAt` is the
 * clock time the latest frame arrived.
 */
export type FrameStore = { current: Frame | null; previous: Frame | null; receivedAt: number; clock: SimClock; visualComplete?: { epoch: number; tick: number } };

/** Animation-loop acknowledgement; the shared store intentionally lives outside React state. */
export function markVisualComplete(store: FrameStore, frame: Frame): void {
  store.visualComplete = { epoch: frame.epoch, tick: frame.tick };
}
