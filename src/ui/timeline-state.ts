import type { Frame } from "@/sim/frame";
import type { SceneName } from "@/agents/naming";

export type PlannerSnapshot = { epoch: number; tick: number; slot: number; entity: number; cell: number };
export function plannerSnapshot(frame: Frame | null, slot: number): PlannerSnapshot | null {
  if (!frame || !Number.isInteger(slot) || slot < 0 || slot >= frame.nVenues || !frame.venueOpen[slot]) return null;
  const entity = frame.venueEntity[slot], cell = frame.venueCell[slot];
  if (entity === undefined || cell === undefined || entity < 0 || cell < 0) return null;
  return { epoch: frame.epoch, tick: frame.tick, slot, entity, cell };
}
export function samePlannerSnapshot(snapshot: PlannerSnapshot | null, frame: Frame | null, slot: number): boolean {
  const current = plannerSnapshot(frame, slot);
  return !!snapshot && !!current && snapshot.epoch === current.epoch && snapshot.tick === current.tick && snapshot.slot === current.slot && snapshot.entity === current.entity && snapshot.cell === current.cell;
}

/** Names belong to lineages present in the current branch; epoch changes invalidate pending work. */
export class SceneNameCache {
  names = new Map<number, SceneName>();
  busy = new Map<number, number>();
  generation = 0;
  private previous: Frame | null = null;
  sync(frame: Frame | null): boolean {
    if (!frame) return false;
    const old = this.previous;
    this.previous = frame;
    if (!old || (old.epoch === frame.epoch && frame.tick >= old.tick)) return false;
    this.generation++;
    this.busy.clear();
    for (const id of this.names.keys()) {
      if (id >= frame.lineageParents.length || old.lineageParents[id] !== frame.lineageParents[id]) this.names.delete(id);
    }
    return true;
  }
  accept(generation: number, requested: number[], got: SceneName[]): boolean {
    if (generation !== this.generation) return false;
    for (const name of got) if (requested.includes(name.id) && this.previous && name.id < this.previous.lineageParents.length) this.names.set(name.id, name);
    return true;
  }
  dispose() { this.generation++; this.busy.clear(); }
}
