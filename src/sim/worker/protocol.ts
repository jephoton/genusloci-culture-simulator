import type { ActionResult } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { SimDigest } from "@/sim/digest";
import type { Frame } from "@/sim/frame";

export const MAIN_TIMELINE = "main";
export const MAX_TICKS_PER_RUN = 520;
export const MIN_TICKS_PER_SECOND = 0.25;
export const MAX_TICKS_PER_SECOND = 30;
/** Pushed frames carry a digest every Nth tick (the digest's fidelity costs a few ms). */
export const DIGEST_EVERY = 4;

export type WorkerCommand =
  | { type: "init"; world: unknown; seed: number; config?: Partial<SimConfig> }
  | { type: "act"; timeline: string; action: unknown }
  | { type: "run"; timeline: string; ticks: number }
  | { type: "rewind"; timeline: string; tick: number }
  | { type: "fork"; timeline: string }
  | { type: "digest"; timeline: string }
  | { type: "dispose"; timeline: string }
  | { type: "play"; timeline: string; ticksPerSecond: number }
  | { type: "pause" }
  | { type: "frame"; timeline: string };

export type WorkerRequest = WorkerCommand & { id: number };

export type CommandResults = {
  init: { timeline: string; digest: SimDigest };
  act: { queued: true };
  run: { digest: SimDigest; results: ActionResult[] };
  rewind: { digest: SimDigest };
  fork: { timeline: string; digest: SimDigest };
  digest: { digest: SimDigest };
  dispose: { disposed: true };
  play: { playing: true };
  pause: { playing: false };
  frame: { frame: Frame };
};

export type CommandResult = CommandResults[keyof CommandResults];

export type WorkerResponse =
  | { id: number; ok: true; result: CommandResult }
  | { id: number; ok: false; error: string };

/** Pushed by the worker while playing (no request id). */
export type FrameMessage = { kind: "frame"; frame: Frame };
export type WorkerMessage = WorkerResponse | FrameMessage;
