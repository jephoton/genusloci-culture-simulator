import type { ActionLogEntry } from "@/sim/actions/schema";
import { computeFidelity } from "@/sim/calibration";
import type { SceneEvent } from "@/sim/scenes/types";
import type { SimState } from "@/sim/state";

export const RECENT = 10;

export type SceneSummary = {
  id: number;
  parent: number | null;
  bornTick: number;
  size: number;
  topEntities: { index: number; name: string }[];
};

/** Compact, serialisable view of a state for the UI and the co-pilot. */
export type SimDigest = {
  tick: number;
  agents: number;
  venues: { open: number; closed: number; events: number };
  scenes: SceneSummary[];
  recentSceneEvents: SceneEvent[];
  recentActions: ActionLogEntry[];
  fidelity: number;
};

export function digest(s: SimState): SimDigest {
  let agents = 0;
  for (const x of s.alive) agents += x;

  const venues = { open: 0, closed: 0, events: 0 };
  for (let v = 0; v < s.nVenues; v++) {
    if (s.venueExpires[v] >= 0) {
      if (s.venueOpen[v]) venues.events++;
    } else if (s.venueOpen[v]) venues.open++;
    else venues.closed++;
  }

  const entities = s.cw.world.entities;
  const scenes = s.scenes.live
    .map((id) => {
      const l = s.scenes.lineages[id];
      return {
        id,
        parent: l.parent,
        bornTick: l.bornTick,
        size: l.size,
        topEntities: l.topEntities.map((index) => ({ index, name: entities[index].name })),
      };
    })
    .sort((a, b) => b.size - a.size || a.id - b.id);

  return {
    tick: s.tick,
    agents,
    venues,
    scenes,
    recentSceneEvents: s.scenes.events.slice(-RECENT),
    recentActions: s.log.slice(-RECENT),
    fidelity: computeFidelity(s).mean,
  };
}
