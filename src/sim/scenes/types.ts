/** A scene's life story. lineages[id].id === id. */
export type Lineage = {
  id: number;
  /** The lineage this one split from, or null if born fresh. */
  parent: number | null;
  bornTick: number;
  diedTick: number | null;
  /** Set when the lineage died by merging into another. */
  mergedInto: number | null;
  size: number;
  peakSize: number;
  /** Strongest entities of the scene's centroid, strongest first. */
  topEntities: number[];
};

export type SceneEventKind = "birth" | "split" | "merge" | "extinction";

/** birth: other = null. split: other = parent. merge: `scene` merged into `other`. extinction: other = null. */
export type SceneEvent = { tick: number; kind: SceneEventKind; scene: number; other: number | null };

export type SceneState = {
  /** Every lineage ever, living or dead. */
  lineages: Lineage[];
  events: SceneEvent[];
  /** Lineage ids of the living scenes, parallel to `centroids`. */
  live: number[];
  /** Unit-length dense centroids over entities. */
  centroids: Float32Array[];
  /** Per agent slot: index into `live`, or -1. */
  assignment: Int32Array;
};

export function createSceneState(agentSlots: number): SceneState {
  return { lineages: [], events: [], live: [], centroids: [], assignment: new Int32Array(agentSlots).fill(-1) };
}

export function cloneSceneState(sc: SceneState): SceneState {
  return {
    lineages: sc.lineages.map((l) => ({ ...l, topEntities: [...l.topEntities] })),
    events: [...sc.events],
    live: [...sc.live],
    centroids: sc.centroids.map((c) => c.slice()),
    assignment: sc.assignment.slice(),
  };
}
