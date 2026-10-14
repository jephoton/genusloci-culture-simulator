import type { ActionResult } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { SimDigest } from "@/sim/digest";
import type { Frame } from "@/sim/frame";
import type { ScoutResult } from "@/sim/scout";
import type { WhatIfResult } from "@/sim/whatif";

export const MAIN_TIMELINE = "main";
export const MAX_TICKS_PER_RUN = 520;
export const MIN_TICKS_PER_SECOND = 0.125;
export const MAX_TICKS_PER_SECOND = 30;
/** Pushed frames carry a digest every Nth tick (the digest's fidelity costs a few ms). */
export const DIGEST_EVERY = 4;
/** Scout limits: candidates per request and simulated weeks (each week is ticksPerWeek ticks). */
export const MAX_SCOUT_CELLS = 4;
export const MAX_SCOUT_WEEKS = 12;
/**
 * The night a scout tests (and "Book it" books). Events carry no distance penalty inside their reach,
 * so a city-wide reach would make every spot draw the same crowd; 1.5 km (the demo cities span about
 * 3.5 km) keeps the night local, so turnout follows the demand around each spot. `weeks` and `duration`
 * are in weeks whatever the tick length.
 */
export const SCOUT_DEFAULTS = { weeks: 4, duration: 3, reachKm: 1.5, capacity: 3000, nearbyKm: 1 } as const;

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
  | { type: "frame"; timeline: string }
  | { type: "demand"; timeline: string; entity: number }
  | { type: "scout"; timeline: string; entity: number; cells: number[]; weeks?: number }
  /** Compares `actions` on a fork against a no-action baseline fork; the timeline is untouched. */
  | { type: "whatIf"; timeline: string; actions: unknown[]; weeks: number };

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
  demand: { demand: number[]; candidates: number[] };
  scout: { results: ScoutResult[]; baselineTick: number };
  whatIf: { result: WhatIfResult };
};

export type CommandResult = CommandResults[keyof CommandResults];

export type WorkerResponse =
  | { id: number; ok: true; result: CommandResult }
  | { id: number; ok: false; error: string };

/** Pushed by the worker while playing (no request id). */
export type FrameMessage = { kind: "frame"; frame: Frame };
/** Pushed once when the play loop stops on its own because a tick failed. */
export type StoppedMessage = { kind: "stopped"; timeline: string; error: string };
export type WorkerMessage = WorkerResponse | FrameMessage | StoppedMessage;
