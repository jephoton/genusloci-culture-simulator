import type { Frame } from "@/sim/frame";

/** Latest and previous frames, held in a ref so per-frame animation doesn't re-render React. */
export type FrameStore = { current: Frame | null; previous: Frame | null; receivedAt: number };
