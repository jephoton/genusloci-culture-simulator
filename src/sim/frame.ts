import { digest, type SimDigest } from "@/sim/digest";
import type { SimState } from "@/sim/state";

/** One tick's render data, streamed from the worker. Every typed array is a fresh copy, safe to transfer. */
export type Frame = {
  timeline: string;
  tick: number;
  earliestTick: number;
  alive: Uint8Array;
  homeCell: Int32Array;
  attendance: Int32Array;
  /** Per agent slot: lineage id of its scene, or -1. */
  scene: Int32Array;
  /** Per lineage id: parent lineage id, or -1. */
  lineageParents: Int32Array;
  nVenues: number;
  venueEntity: Int32Array;
  venueCell: Int32Array;
  venueOpen: Uint8Array;
  venueHealth: Float32Array;
  venueAttendance: Int32Array;
  venueExpires: Int32Array;
  digest?: SimDigest;
};

export function buildFrame(
  s: SimState,
  timeline: string,
  earliestTick: number,
  withDigest: boolean,
): { frame: Frame; transfer: ArrayBuffer[] } {
  const scene = new Int32Array(s.alive.length).fill(-1);
  for (let i = 0; i < scene.length; i++) {
    const a = s.scenes.assignment[i];
    if (a >= 0) scene[i] = s.scenes.live[a];
  }
  const n = s.nVenues;
  const frame: Frame = {
    timeline,
    tick: s.tick,
    earliestTick,
    alive: s.alive.slice(),
    homeCell: s.homeCell.slice(),
    attendance: s.attendance.slice(),
    scene,
    lineageParents: Int32Array.from(s.scenes.lineages, (l) => l.parent ?? -1),
    nVenues: n,
    venueEntity: s.venueEntity.slice(0, n),
    venueCell: s.venueCell.slice(0, n),
    venueOpen: s.venueOpen.slice(0, n),
    venueHealth: s.venueHealth.slice(0, n),
    venueAttendance: s.venueAttendance.slice(0, n),
    venueExpires: s.venueExpires.slice(0, n),
  };
  if (withDigest) frame.digest = digest(s);
  const transfer = [
    frame.alive, frame.homeCell, frame.attendance, frame.scene, frame.lineageParents,
    frame.venueEntity, frame.venueCell, frame.venueOpen, frame.venueHealth, frame.venueAttendance, frame.venueExpires,
  ].map((a) => a.buffer as ArrayBuffer);
  return { frame, transfer };
}
