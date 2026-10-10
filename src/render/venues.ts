import { type CityLayout, landmarkPosition, landmarkScale, type XZ } from "@/render/layout";
import type { Frame } from "@/sim/frame";
import { weeksToTicks } from "@/sim/time";
import type { VenueKind, World } from "@/world/schema";

/** The simulation's closure rules (from SimConfig) that decide when a venue is on its way out; `graceTicks` is in weeks. */
export type ClosureRules = { closeThreshold: number; graceTicks: number };

/**
 * Whether venue slot `v` is struggling: open, permanent (not an event), past the grace period and with
 * health below the closure threshold, so it closes if it stays there. Frame tick T is the state after
 * the step at tick T - 1, which is the first to count low health once T - 1 >= the grace period in ticks.
 */
export function isStruggling(
  frame: Pick<Frame, "tick" | "ticksPerWeek" | "venueOpen" | "venueExpires" | "venueHealth">,
  v: number,
  rules: ClosureRules,
): boolean {
  const grace = weeksToTicks(rules.graceTicks, frame.ticksPerWeek);
  return frame.venueOpen[v] === 1 && frame.venueExpires[v] < 0 && frame.tick > grace && frame.venueHealth[v] < rules.closeThreshold;
}

export type VenueView = {
  slot: number;
  entity: number;
  name: string;
  kind: VenueKind;
  position: XZ;
  /** Scale the landmark is drawn at: its pad's (see CityLayout.padScale). */
  scale: number;
  open: boolean;
  isEvent: boolean;
  health: number;
  visitors: number;
  /** Lineage id of the most common scene among this tick's visitors, or -1. */
  dominantScene: number;
};

/** Per venue slot render data. Venues in the same cell take landmark pads in slot order. */
export function venueViews(frame: Frame, layout: CityLayout, world: World): VenueView[] {
  const counts = Array.from({ length: frame.nVenues }, () => new Map<number, number>());
  for (let i = 0; i < frame.attendance.length; i++) {
    const v = frame.attendance[i];
    const scene = frame.scene[i];
    if (v < 0 || v >= frame.nVenues || scene < 0) continue;
    counts[v].set(scene, (counts[v].get(scene) ?? 0) + 1);
  }
  const padsUsed = new Map<number, number>();
  const views: VenueView[] = [];
  for (let v = 0; v < frame.nVenues; v++) {
    const cell = frame.venueCell[v];
    const pad = padsUsed.get(cell) ?? 0;
    padsUsed.set(cell, pad + 1);
    let dominantScene = -1;
    let best = 0;
    for (const [scene, k] of counts[v]) {
      if (k > best || (k === best && scene < dominantScene)) {
        best = k;
        dominantScene = scene;
      }
    }
    const entity = frame.venueEntity[v];
    views.push({
      slot: v,
      entity,
      name: world.entities[entity].name,
      kind: world.entities[entity].kind ?? "other",
      position: landmarkPosition(layout, cell, pad),
      scale: landmarkScale(layout, cell, pad),
      open: frame.venueOpen[v] === 1,
      isEvent: frame.venueExpires[v] >= 0,
      health: frame.venueHealth[v],
      visitors: frame.venueAttendance[v],
      dominantScene,
    });
  }
  return views;
}

const viewCache = new WeakMap<Frame, VenueView[]>();
/** venueViews, computed once per frame object (layout and world are stable for a frame's lifetime). */
export function venueViewsOf(frame: Frame, layout: CityLayout, world: World): VenueView[] {
  let views = viewCache.get(frame);
  if (!views) {
    views = venueViews(frame, layout, world);
    viewCache.set(frame, views);
  }
  return views;
}
