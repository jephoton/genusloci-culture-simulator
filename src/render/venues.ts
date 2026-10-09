import { type CityLayout, landmarkPosition, landmarkScale, type XZ } from "@/render/layout";
import type { Frame } from "@/sim/frame";
import type { VenueKind, World } from "@/world/schema";

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
