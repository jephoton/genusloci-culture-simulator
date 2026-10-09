import type { ActionResult } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { SimDigest } from "@/sim/digest";

export const MAIN_TIMELINE = "main";
export const MAX_TICKS_PER_RUN = 520;

export type WorkerCommand =
  | { type: "init"; world: unknown; seed: number; config?: Partial<SimConfig> }
  | { type: "act"; timeline: string; action: unknown }
  | { type: "run"; timeline: string; ticks: number }
  | { type: "rewind"; timeline: string; tick: number }
  | { type: "fork"; timeline: string }
  | { type: "digest"; timeline: string }
  | { type: "dispose"; timeline: string };

export type WorkerRequest = WorkerCommand & { id: number };

export type CommandResults = {
  init: { timeline: string; digest: SimDigest };
  act: { queued: true };
  run: { digest: SimDigest; results: ActionResult[] };
  rewind: { digest: SimDigest };
  fork: { timeline: string; digest: SimDigest };
  digest: { digest: SimDigest };
  dispose: { disposed: true };
};

export type CommandResult = CommandResults[keyof CommandResults];

export type WorkerResponse =
  | { id: number; ok: true; result: CommandResult }
  | { id: number; ok: false; error: string };
