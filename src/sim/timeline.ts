import { validateAction } from "@/sim/actions/apply";
import type { Action, ActionResult } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import { cloneState, initState, type SimState } from "@/sim/state";
import { step } from "@/sim/step";
import type { World } from "@/world/schema";

export const DEFAULT_SNAPSHOT_EVERY = 10;
export const MAX_SNAPSHOTS = 30;

/**
 * A simulation run you can steer and rewind. Actions are queued and applied at the start of the next
 * tick. Snapshots are taken every `snapshotEvery` ticks. A rewind restores the nearest earlier
 * snapshot and replays the action log, so it is exact.
 */
export class Timeline {
  state: SimState;
  private pending: Action[] = [];
  private readonly snapshots: Map<number, SimState>;

  constructor(
    state: SimState,
    private readonly snapshotEvery = DEFAULT_SNAPSHOT_EVERY,
    snapshots?: Map<number, SimState>,
  ) {
    this.state = state;
    this.snapshots = snapshots ?? new Map([[state.tick, cloneState(state)]]);
  }

  static create(world: World, config: SimConfig, seed: number, snapshotEvery?: number): Timeline {
    return new Timeline(initState(world, config, seed), snapshotEvery);
  }

  /** Queues an action for the next tick; returns why it can't apply, or null if queued. */
  queue(action: Action): string | null {
    const error = validateAction(this.state, action);
    if (!error) this.pending.push(action);
    return error;
  }

  advance(ticks: number): ActionResult[] {
    const results: ActionResult[] = [];
    for (let t = 0; t < ticks; t++) {
      const actions = this.pending;
      this.pending = [];
      results.push(...step(this.state, actions));
      if (this.state.tick % this.snapshotEvery === 0) this.snapshot();
    }
    return results;
  }

  /** Earliest tick that can be rewound to. */
  earliest(): number {
    return Math.min(...this.snapshots.keys());
  }

  /** Restores the exact state at `tick` (between earliest() and now). Later history is discarded. */
  rewind(tick: number): void {
    if (!Number.isInteger(tick) || tick < this.earliest() || tick > this.state.tick) {
      throw new Error(`cannot rewind to tick ${tick} (range ${this.earliest()}..${this.state.tick})`);
    }
    const base = Math.max(...[...this.snapshots.keys()].filter((k) => k <= tick));
    const s = cloneState(this.snapshots.get(base) as SimState);
    const replay = this.state.log.filter((e) => e.tick >= base && e.tick < tick);
    while (s.tick < tick) step(s, replay.filter((e) => e.tick === s.tick).map((e) => e.action));
    for (const k of [...this.snapshots.keys()]) if (k > tick) this.snapshots.delete(k);
    this.pending = [];
    this.state = s;
  }

  /** An independent timeline that shares history (snapshots are never mutated) up to now. */
  fork(): Timeline {
    const t = new Timeline(cloneState(this.state), this.snapshotEvery, new Map(this.snapshots));
    t.pending = [...this.pending];
    return t;
  }

  private snapshot(): void {
    this.snapshots.set(this.state.tick, cloneState(this.state));
    if (this.snapshots.size > MAX_SNAPSHOTS) {
      // Keep the earliest snapshot so the start stays reachable; drop the next oldest.
      const keys = [...this.snapshots.keys()].sort((a, b) => a - b);
      this.snapshots.delete(keys[1]);
    }
  }
}
