/** Longest real-time step one sync may add: a stalled or hidden tab resumes where it was, not seconds later. */
const DEFAULT_MAX_STEP_MS = 250;

/**
 * Animation time that only runs while the simulation plays. Renderers read `now()` (milliseconds)
 * instead of `performance.now()`, so pausing freezes every animation mid-motion and resuming carries
 * on from exactly there. One driver calls `sync(performance.now())` once per rendered frame.
 */
export class SimClock {
  private elapsed = 0;
  private since = 0;
  private running = false;

  constructor(private readonly maxStepMs = DEFAULT_MAX_STEP_MS) {}

  get playing(): boolean {
    return this.running;
  }

  /** Accumulated animation milliseconds. */
  now(): number {
    return this.elapsed;
  }

  /** Advances by the real time since the last sync (capped), only while playing. */
  sync(realNow: number): void {
    if (this.running) this.elapsed += Math.min(this.maxStepMs, Math.max(0, realNow - this.since));
    this.since = Math.max(this.since, realNow);
  }

  /** Starts or stops accumulation at real time `realNow`; time up to then counts if it was playing. */
  setPlaying(playing: boolean, realNow: number): void {
    if (playing === this.running) return;
    this.sync(realNow);
    this.running = playing;
    this.since = realNow;
  }
}
