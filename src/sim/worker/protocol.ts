import type { ActionResult } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { SimDigest } from "@/sim/digest";
import type { Frame } from "@/sim/frame";
import type { ScoutResult } from "@/sim/scout";
import type { BookingResult } from "@/sim/booking";
import type { ResidentProfile } from "@/sim/resident";
import type { WhatIfResult } from "@/sim/whatif";
import type { CaseReport, CaseSpec } from "@/sim/case";
import type { EventOutcome } from "@/sim/events";

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

/** Book for my venue: acts per comparison, run lengths (weeks) on offer. */
export const MAX_BOOKING_ACTS = 5;
export const BOOKING_WEEKS = [1, 2, 4] as const;

/**
 * The venue race: up to three venues host the same artist in parallel seeded futures. The race plays on
 * its own timeline; the live city is untouched. `RACE_RUNS` futures make the forecast, and the one
 * played on screen is future 1.
 */
export const RACE_TIMELINE = "race";
export const MAX_RACE_VENUES = 3;
export const RACE_RUNS = 3;
export const MAX_RACE_NIGHTS = 7;

/** One race request: the artist (an entity, or an outside artist's taste profile) and the venues. */
export type RaceRequest = { entity: number; profile?: { entity: number; weight: number }[]; hosts: number[]; startTick: number; nights: number };

export type WorkerCommand =
  | { type: "init"; world: unknown; seed: number; config?: Partial<SimConfig> }
  | { type: "act"; timeline: string; action: unknown }
  | { type: "run"; timeline: string; ticks: number }
  | { type: "rewind"; timeline: string; tick: number }
  | { type: "fork"; timeline: string }
  | { type: "digest"; timeline: string }
  | { type: "dispose"; timeline: string }
  | { type: "play"; timeline: string; ticksPerSecond: number }
  | { type: "startCase"; timeline: string; spec: CaseSpec; ticksPerSecond: number; autoplay?: boolean }
  | { type: "finishCase"; timeline: string }
  | { type: "pause" }
  | { type: "frame"; timeline: string }
  | { type: "demand"; timeline: string; entity: number }
  | { type: "venueFans"; timeline: string; entity: number; profile?: { entity: number; weight: number }[] }
  | { type: "scout"; timeline: string; entity: number; cells: number[]; weeks?: number }
  /** Compares `actions` on a fork against a no-action baseline fork; the timeline is untouched. */
  | { type: "whatIf"; timeline: string; actions: unknown[]; weeks: number }
  /** A typical member of a scene (the `skip`-th closest to its centre), for interviews. */
  | { type: "resident"; timeline: string; scene: number; skip?: number }
  /** Compares acts as events at a host venue against a no-event baseline; the timeline is untouched. */
  | { type: "book"; timeline: string; venue: number; acts: unknown[]; weeks: number; startTick?: number; durationDays?: number }
  /** Sets up a venue race from the timeline's current state (play it with `play` on RACE_TIMELINE). */
  | { type: "startRace"; timeline: string; race: RaceRequest }
  | { type: "endRace" };

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
  startCase: { started: true };
  finishCase: { finished: true };
  pause: { playing: false };
  frame: { frame: Frame };
  demand: { demand: number[]; candidates: number[] };
  /** Per venue slot: taste-weighted residents within an event's reach (`SCOUT_DEFAULTS.reachKm`). */
  venueFans: { fans: number[] };
  scout: { results: ScoutResult[]; baselineTick: number };
  whatIf: { result: WhatIfResult };
  resident: { profile: ResidentProfile | null };
  book: { results: BookingResult[]; baselineTick: number };
  /** `runs[k][c]`: candidate c's outcome in seeded future k (future 0 is the one played). */
  startRace: { runs: EventOutcome[][]; frame: Frame };
  endRace: { ended: true };
};

export type CommandResult = CommandResults[keyof CommandResults];

export type WorkerResponse =
  | { id: number; ok: true; result: CommandResult }
  | { id: number; ok: false; error: string };

/** Pushed by the worker while playing (no request id). */
export type FrameMessage = { kind: "frame"; frame: Frame };
/** Pushed once when the play loop stops on its own because a tick failed. */
export type StoppedMessage = { kind: "stopped"; timeline: string; error: string };
export type CaseCompleteMessage = { kind: "case-complete"; timeline: string; report: CaseReport };
/** Pushed once when the played race reaches its last night. */
export type RaceCompleteMessage = { kind: "race-complete"; outcomes: EventOutcome[] };
export type WorkerMessage = WorkerResponse | FrameMessage | StoppedMessage | CaseCompleteMessage | RaceCompleteMessage;
