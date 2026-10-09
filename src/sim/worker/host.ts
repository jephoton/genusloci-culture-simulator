import { parseAction } from "@/sim/actions/schema";
import { DEFAULT_CONFIG, parseConfigOverrides } from "@/sim/config";
import { digest } from "@/sim/digest";
import { Timeline } from "@/sim/timeline";
import {
  type CommandResult,
  MAIN_TIMELINE,
  MAX_TICKS_PER_RUN,
  type WorkerCommand,
  type WorkerRequest,
  type WorkerResponse,
} from "@/sim/worker/protocol";
import { parseWorld } from "@/world/schema";

/** Owns the simulation timelines inside the worker. Every request gets exactly one response; it never throws. */
export class SimHost {
  private readonly timelines = new Map<string, Timeline>();
  private forks = 0;

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
        this.timelines.delete(cmd.timeline);
        return { disposed: true };
      }
      default:
        throw new Error(`unknown command "${String((cmd as { type?: unknown }).type)}"`);
    }
  }
}
