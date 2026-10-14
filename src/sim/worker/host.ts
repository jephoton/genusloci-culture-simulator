import { validateAction } from "@/sim/actions/apply";
import { parseAction } from "@/sim/actions/schema";
import { DEFAULT_CONFIG, parseConfigOverrides } from "@/sim/config";
import { digest } from "@/sim/digest";
import { buildFrame } from "@/sim/frame";
import { demandByCell, pickCandidates, scoutCandidates } from "@/sim/scout";
import { MAX_WHATIF_WEEKS, whatIf } from "@/sim/whatif";
import type { SimState } from "@/sim/state";
import { Timeline } from "@/sim/timeline";
import {
  type CommandResult,
  DIGEST_EVERY,
  type FrameMessage,
  MAIN_TIMELINE,
  MAX_SCOUT_CELLS,
  MAX_SCOUT_WEEKS,
  MAX_TICKS_PER_RUN,
  MAX_TICKS_PER_SECOND,
  MIN_TICKS_PER_SECOND,
  SCOUT_DEFAULTS,
  type StoppedMessage,
  type WorkerCommand,
  type WorkerRequest,
  type WorkerResponse,
} from "@/sim/worker/protocol";
import { distKm } from "@/sim/world-index";
import { parseWorld } from "@/world/schema";

const CANDIDATES = 3;
const MIN_CANDIDATE_KM = 0.5;

const isIndex = (x: unknown, n: number): x is number => Number.isInteger(x) && (x as number) >= 0 && (x as number) < n;

function checkEntity(s: SimState, entity: unknown): number {
  if (!isIndex(entity, s.cw.nEntities)) throw new Error(`unknown entity ${String(entity)}`);
  return entity;
}

/** Median distance from each cell to its nearest neighbour (O(cells²); cached per compiled world). */
const nearestCellKm = new WeakMap<object, number>();
function medianNearestCellKm(s: SimState): number {
  const cached = nearestCellKm.get(s.cw);
  if (cached !== undefined) return cached;
  const n = s.cw.nCells;
  const nearest: number[] = [];
  for (let a = 0; a < n; a++) {
    let best = Infinity;
    for (let b = 0; b < n; b++) if (b !== a) best = Math.min(best, distKm(s.cw, a, b));
    if (best < Infinity) nearest.push(best);
  }
  nearest.sort((x, y) => x - y);
  const median = nearest.length ? nearest[Math.floor(nearest.length / 2)] : 0;
  nearestCellKm.set(s.cw, median);
  return median;
}

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
  private epoch = 0;
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
      const { frame, transfer } = buildFrame(t.state, p.timeline, t.earliest(), p.count % DIGEST_EVERY === 0, this.epoch);
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
        this.epoch++;
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
        this.epoch++;
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
        return { frame: buildFrame(t.state, cmd.timeline, t.earliest(), true, this.epoch).frame };
      }
      case "demand": {
        const s = this.timeline(cmd.timeline).state;
        const demand = demandByCell(s, checkEntity(s, cmd.entity));
        const minKm = Math.max(MIN_CANDIDATE_KM, 1.2 * medianNearestCellKm(s));
        return { demand, candidates: pickCandidates(s, demand, CANDIDATES, minKm) };
      }
      case "scout": {
        const s = this.timeline(cmd.timeline).state;
        const entity = checkEntity(s, cmd.entity);
        const weeks = cmd.weeks ?? SCOUT_DEFAULTS.weeks;
        if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_SCOUT_WEEKS) {
          throw new Error(`weeks must be an integer in [1, ${MAX_SCOUT_WEEKS}]`);
        }
        const cells: unknown = cmd.cells;
        if (!Array.isArray(cells) || cells.length < 1 || cells.length > MAX_SCOUT_CELLS) {
          throw new Error(`cells must list 1 to ${MAX_SCOUT_CELLS} cells`);
        }
        for (const c of cells) if (!isIndex(c, s.cw.nCells)) throw new Error(`unknown cell ${String(c)}`);
        const { duration, reachKm, capacity, nearbyKm } = SCOUT_DEFAULTS;
        const error = validateAction(s, { type: "scheduleEvent", entity, cell: cells[0], duration, reachKm, capacity });
        if (error) throw new Error(error);
        const results = scoutCandidates(s, cells as number[], { entity, weeks, duration, reachKm, capacity, nearbyKm });
        return { results, baselineTick: s.tick };
      }
      case "whatIf": {
        const s = this.timeline(cmd.timeline).state;
        if (!Number.isInteger(cmd.weeks) || cmd.weeks < 1 || cmd.weeks > MAX_WHATIF_WEEKS) {
          throw new Error(`weeks must be an integer in [1, ${MAX_WHATIF_WEEKS}]`);
        }
        const raw: unknown = cmd.actions;
        if (!Array.isArray(raw) || raw.length < 1 || raw.length > 5) throw new Error("actions must list 1 to 5 actions");
        const actions = raw.map((a) => parseAction(a));
        return { result: whatIf(s, actions, cmd.weeks) };
      }
      default:
        throw new Error(`unknown command "${String((cmd as { type?: unknown }).type)}"`);
    }
  }
}
