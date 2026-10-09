import { parseAction } from "@/sim/actions/schema";
import { DEFAULT_CONFIG, parseConfigOverrides } from "@/sim/config";
import { digest } from "@/sim/digest";
import { buildFrame } from "@/sim/frame";
import { Timeline } from "@/sim/timeline";
import {
  type CommandResult,
  DIGEST_EVERY,
  type FrameMessage,
  MAIN_TIMELINE,
  MAX_TICKS_PER_RUN,
  MAX_TICKS_PER_SECOND,
  MIN_TICKS_PER_SECOND,
  type StoppedMessage,
  type WorkerCommand,
  type WorkerRequest,
  type WorkerResponse,
} from "@/sim/worker/protocol";
import { parseWorld } from "@/world/schema";

/** Side effects the host needs for streaming; injected so tests can drive the loop by hand. */
export type HostIO = {
  emit(message: FrameMessage | StoppedMessage, transfer: ArrayBuffer[]): void;
  schedule(fn: () => void, ms: number): unknown;
  cancel(handle: unknown): void;
};

const NO_IO: HostIO = { emit: () => {}, schedule: () => null, cancel: () => {} };

type Player = { timeline: string; intervalMs: number; handle: unknown; count: number };

/** Owns the simulation timelines inside the worker. Every request gets exactly one response; it never throws. */
export class SimHost {
  private readonly timelines = new Map<string, Timeline>();
  private forks = 0;
  private player: Player | null = null;

  constructor(private readonly io: HostIO = NO_IO) {}

  private stopPlaying(): void {
    if (this.player) this.io.cancel(this.player.handle);
    this.player = null;
  }

  /** One play-loop tick for `p`; a callback left over from a stopped or replaced player does nothing. */
  private loop(p: Player): void {
    if (this.player !== p) return;
    const t = this.timelines.get(p.timeline);
    if (!t) {
      this.stopPlaying();
      return;
    }
    try {
      t.advance(1);
      p.count++;
      const { frame, transfer } = buildFrame(t.state, p.timeline, t.earliest(), p.count % DIGEST_EVERY === 0);
      this.io.emit({ kind: "frame", frame }, transfer);
    } catch (e) {
      this.stopPlaying();
      this.io.emit({ kind: "stopped", timeline: p.timeline, error: e instanceof Error ? e.message : String(e) }, []);
      return;
    }
    p.handle = this.io.schedule(() => this.loop(p), p.intervalMs);
  }

  handle(req: WorkerRequest): WorkerResponse {
    try {
      return { id: req.id, ok: true, result: this.execute(req) };
    } catch (e) {
      return { id: req.id, ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  }

  private timeline(id: string): Timeline {
    const t = this.timelines.get(id);
    if (!t) throw new Error(`unknown timeline "${id}"`);
    return t;
  }

  private execute(cmd: WorkerCommand): CommandResult {
    switch (cmd.type) {
      case "init": {
        const t = Timeline.create(parseWorld(cmd.world), { ...DEFAULT_CONFIG, ...parseConfigOverrides(cmd.config ?? {}) }, cmd.seed);
        this.stopPlaying();
        this.timelines.clear();
        this.forks = 0;
        this.timelines.set(MAIN_TIMELINE, t);
        return { timeline: MAIN_TIMELINE, digest: digest(t.state) };
      }
      case "act": {
        const error = this.timeline(cmd.timeline).queue(parseAction(cmd.action));
        if (error) throw new Error(error);
        return { queued: true };
      }
      case "run": {
        if (!Number.isInteger(cmd.ticks) || cmd.ticks < 1 || cmd.ticks > MAX_TICKS_PER_RUN) {
          throw new Error(`ticks must be an integer in [1, ${MAX_TICKS_PER_RUN}]`);
        }
        const t = this.timeline(cmd.timeline);
        const results = t.advance(cmd.ticks);
        return { digest: digest(t.state), results };
      }
      case "rewind": {
        const t = this.timeline(cmd.timeline);
        t.rewind(cmd.tick);
        return { digest: digest(t.state) };
      }
      case "fork": {
        const t = this.timeline(cmd.timeline).fork();
        const id = `fork-${++this.forks}`;
        this.timelines.set(id, t);
        return { timeline: id, digest: digest(t.state) };
      }
      case "digest":
        return { digest: digest(this.timeline(cmd.timeline).state) };
      case "dispose": {
        if (cmd.timeline === MAIN_TIMELINE) throw new Error("cannot dispose the main timeline");
        this.timeline(cmd.timeline);
        if (this.player?.timeline === cmd.timeline) this.stopPlaying();
        this.timelines.delete(cmd.timeline);
        return { disposed: true };
      }
      case "play": {
        if (!(cmd.ticksPerSecond >= MIN_TICKS_PER_SECOND && cmd.ticksPerSecond <= MAX_TICKS_PER_SECOND)) {
          throw new Error(`ticksPerSecond must be in [${MIN_TICKS_PER_SECOND}, ${MAX_TICKS_PER_SECOND}]`);
        }
        this.timeline(cmd.timeline);
        this.stopPlaying();
        const player: Player = { timeline: cmd.timeline, intervalMs: 1000 / cmd.ticksPerSecond, handle: null, count: 0 };
        this.player = player;
        player.handle = this.io.schedule(() => this.loop(player), player.intervalMs);
        return { playing: true };
      }
      case "pause":
        this.stopPlaying();
        return { playing: false };
      case "frame": {
        const t = this.timeline(cmd.timeline);
        return { frame: buildFrame(t.state, cmd.timeline, t.earliest(), true).frame };
      }
      default:
        throw new Error(`unknown command "${String((cmd as { type?: unknown }).type)}"`);
    }
  }
}
