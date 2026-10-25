import type { VenueClosure } from "@/sim/closures";
import { digest, type SimDigest } from "@/sim/digest";
import { profileCosine } from "@/sim/niches";
import type { SceneEvent } from "@/sim/scenes/types";
import type { SimState } from "@/sim/state";

/** One tick's render data, streamed from the worker. Every typed array is a fresh copy, safe to transfer. */
export type Frame = {
  timeline: string;
  tick: number;
  /** Ticks per simulated week (1 = weekly ticks, 7 = daily: tick % 7 is the weekday, Monday = 0). */
  ticksPerWeek: number;
  earliestTick: number;
  /** Bumped on init and rewind: only frames of the same epoch with consecutive ticks are a continuous story. */
  epoch: number;
  scheduledEvents?: import("@/sim/scheduling").ScheduledEvent[];
  /** Scene events recorded by the step that produced this frame (tick === frame.tick - 1). */
  sceneEvents: SceneEvent[];
  alive: Uint8Array;
  homeCell: Int32Array;
  attendance: Int32Array;
  /** Optional for older frame fixtures; agent slots × ticksPerWeek, recorded recent outings. */
  attendanceHistory?: Int32Array;
  /** Per agent slot: lineage id of its scene, or -1. */
  scene: Int32Array;
  /** Per lineage id: parent lineage id, or -1. */
  lineageParents: Int32Array;
  nVenues: number;
  venueClosures?: (VenueClosure | null)[];
  closureEvents?: VenueClosure[];
  venueWeekVisits?: Int32Array;
  venueCapacity?: Float32Array;
  venueRent?: Float32Array;
  venueLowTicks?: Int32Array;
  venueEntity: Int32Array;
  venueLabels?: (string | null)[];
  venueCell: Int32Array;
  venueOpen: Uint8Array;
  venueHealth: Float32Array;
  venueAttendance: Int32Array;
  venueExpires: Int32Array;
  /** Per venue slot: lineage id of the live scene its taste profile best matches (its identity), or -1. */
  venueScene: Int32Array;
  digest?: SimDigest;
  /** Venue race frames only (see RACE_TIMELINE). */
  race?: RaceFrame;
};

/**
 * A venue race night. The city drawn is the no-event baseline, except that each candidate's event
 * visitors (from that candidate's own future) are shown going to its host venue.
 */
export type RaceFrame = {
  /** Host venue slot per candidate. */
  hosts: number[];
  /** Per agent slot: the candidate whose event it attended this night, or -1. */
  group: Int8Array;
  /** Per agent slot: bit k is set if it attended candidate k's event this night (its own dot shows `group`). */
  went: Uint8Array;
  /** Per agent slot: the candidate whose event it first attended on any night so far, or -1. */
  seen: Int8Array;
  tonight: number[];
  total: number[];
  /** Nights played so far, and in all. */
  night: number;
  nights: number;
};

/** Per venue slot: the live scene whose centroid has the highest cosine with the venue's profile, or -1. */
export function venueScenes(s: SimState): Int32Array {
  const out = new Int32Array(s.nVenues).fill(-1);
  const { live, centroids } = s.scenes;
  const nE = s.cw.nEntities;
  for (let v = 0; v < s.nVenues; v++) {
    let best = -Infinity;
    for (let a = 0; a < live.length; a++) {
      const match = profileCosine(s.venueProfile, v * nE, nE, centroids[a]);
      if (match > best) {
        best = match;
        out[v] = live[a];
      }
    }
  }
  return out;
}

export function buildFrame(
  s: SimState,
  timeline: string,
  earliestTick: number,
  withDigest: boolean,
  epoch: number,
): { frame: Frame; transfer: ArrayBuffer[] } {
  const scene = new Int32Array(s.alive.length).fill(-1);
  for (let i = 0; i < scene.length; i++) {
    const a = s.scenes.assignment[i];
    if (a >= 0) scene[i] = s.scenes.live[a];
  }
  const n = s.nVenues;
  const attendance = s.attendance.slice();
  // Raw state preserves expired-event attendance for final-turnout accounting. A reused venue
  // lifetime clears history: do not draw those old visitors as the replacement venue's crowd.
  if (s.tick > 0) for (let a = 0; a < attendance.length; a++) {
    if (s.attendanceHistory[a * s.config.ticksPerWeek + (s.tick - 1) % s.config.ticksPerWeek] !== attendance[a]) attendance[a] = -1;
  }
  // Events only grow, in tick order: scan back from the end and stop at the first older one.
  const events = s.scenes.events;
  let first = events.length;
  while (first > 0 && events[first - 1].tick === s.tick - 1) first--;
  const frame: Frame = {
    timeline,
    tick: s.tick,
    ticksPerWeek: s.config.ticksPerWeek,
    earliestTick,
    epoch,
    scheduledEvents: structuredClone([
      ...s.scheduledEvents.filter((e) => e.status === "scheduled" || e.status === "started"),
      ...s.scheduledEvents.filter((e) => e.status !== "scheduled" && e.status !== "started").slice(-12),
    ]),
    sceneEvents: events.slice(first),
    alive: s.alive.slice(),
    homeCell: s.homeCell.slice(),
    attendance,
    attendanceHistory: s.attendanceHistory.slice(),
    scene,
    lineageParents: Int32Array.from(s.scenes.lineages, (l) => l.parent ?? -1),
    nVenues: n,
    venueClosures: s.venueClosures.slice(0, n).map((c) => c ? { ...c } : null),
    closureEvents: s.closureEvents.slice(-64).map((c) => ({ ...c })),
    venueWeekVisits: s.venueWeekVisits.slice(0, n),
    venueCapacity: s.venueCapacity.slice(0, n),
    venueRent: Float32Array.from(s.venueCell.slice(0, n), (cell) => s.cellRent[cell]),
    venueLowTicks: s.venueLowTicks.slice(0, n),
    venueEntity: s.venueEntity.slice(0, n),
    venueLabels: s.venueLabels.slice(0, n),
    venueCell: s.venueCell.slice(0, n),
    venueOpen: s.venueOpen.slice(0, n),
    venueHealth: s.venueHealth.slice(0, n),
    venueAttendance: s.venueAttendance.slice(0, n),
    venueExpires: s.venueExpires.slice(0, n),
    venueScene: venueScenes(s),
  };
  if (withDigest) frame.digest = digest(s);
  // venueScene (one int per venue) is small enough to copy rather than transfer.
  const transfer = [
    frame.alive, frame.homeCell, frame.attendance, frame.scene, frame.lineageParents,
    frame.venueEntity, frame.venueCell, frame.venueOpen, frame.venueHealth, frame.venueAttendance, frame.venueExpires,
  ].map((a) => a.buffer as ArrayBuffer);
  return { frame, transfer };
}
