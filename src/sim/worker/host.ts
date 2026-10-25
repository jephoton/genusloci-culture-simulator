import { validateAction } from "@/sim/actions/apply";
import { CaseMonitor, type CaseReport } from "@/sim/case";
import { parseAction } from "@/sim/actions/schema";
import { DEFAULT_CONFIG, parseConfigOverrides } from "@/sim/config";
import { digest } from "@/sim/digest";
import { buildFrame, type Frame } from "@/sim/frame";
import { PairedEventRun, runEventCandidateRuns, type EventRunOptions } from "@/sim/events";
import { runSeed } from "@/sim/whatif";
import { demandByCell, pickCandidates, scoutCandidates } from "@/sim/scout";
import { MAX_WHATIF_WEEKS, whatIf } from "@/sim/whatif";
import { residentProfile, typicalResident } from "@/sim/resident";
import { BOOKING_RUNS, type BookingAct, bookActs } from "@/sim/booking";
import type { SimState } from "@/sim/state";
import { Timeline } from "@/sim/timeline";
import {
  BOOKING_WEEKS,
  type CommandResult,
  type CaseCompleteMessage,
  DIGEST_EVERY,
  type FrameMessage,
  MAIN_TIMELINE,
  MAX_BOOKING_ACTS,
  MAX_SCOUT_CELLS,
  MAX_SCOUT_WEEKS,
  MAX_TICKS_PER_RUN,
  MAX_TICKS_PER_SECOND,
  MIN_TICKS_PER_SECOND,
  MAX_RACE_NIGHTS,
  MAX_RACE_VENUES,
  RACE_RUNS,
  RACE_TIMELINE,
  type RaceCompleteMessage,
  type RaceRequest,
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
  emit(message: FrameMessage | StoppedMessage | CaseCompleteMessage | RaceCompleteMessage, transfer: ArrayBuffer[]): void;
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
  private activeCase: { timeline: string; monitor: CaseMonitor } | null = null;
  private race: { run: PairedEventRun; hosts: number[]; seen: Int8Array } | null = null;

  constructor(private readonly io: HostIO = NO_IO) {}

  private stopPlaying(): void {
    if (this.player) this.io.cancel(this.player.handle);
    this.player = null;
  }

  private completeCase(reason: CaseReport["reason"]): void {
    const active = this.activeCase;
    if (!active) return;
    this.activeCase = null;
    this.stopPlaying();
    this.io.emit({ kind: "case-complete", timeline: active.timeline, report: active.monitor.report(this.timeline(active.timeline).state, reason) }, []);
  }

  private startPlaying(timeline: string, ticksPerSecond: number): void {
    this.stopPlaying();
    const player: Player = { timeline, intervalMs: 1000 / ticksPerSecond, handle: null, count: 0 };
    this.player = player;
    player.handle = this.io.schedule(() => this.loop(player), player.intervalMs);
  }

  private checkSpeed(speed: number): void {
    if (!(speed >= MIN_TICKS_PER_SECOND && speed <= MAX_TICKS_PER_SECOND)) {
      throw new Error(`ticksPerSecond must be in [${MIN_TICKS_PER_SECOND}, ${MAX_TICKS_PER_SECOND}]`);
    }
  }

  /** One play-loop tick for `p`; a callback left over from a stopped or replaced player does nothing. */
  private loop(p: Player): void {
    if (this.player !== p) return;
    if (p.timeline === RACE_TIMELINE) {
      this.raceLoop(p);
      return;
    }
    const t = this.timelines.get(p.timeline);
    if (!t) {
      this.stopPlaying();
      return;
    }
    try {
      const active = this.activeCase?.timeline === p.timeline ? this.activeCase : null;
      const before = active?.monitor.completion(t.state);
      if (before) { this.completeCase(before); return; }
      t.advance(1);
      const completion = active?.monitor.observe(t.state);
      p.count++;
      const { frame, transfer } = buildFrame(t.state, p.timeline, t.earliest(), p.count % DIGEST_EVERY === 0, this.epoch);
      this.io.emit({ kind: "frame", frame }, transfer);
      if (completion) { this.completeCase(completion); return; }
    } catch (e) {
      this.completeCase("interrupted");
      this.stopPlaying();
      this.io.emit({ kind: "stopped", timeline: p.timeline, error: e instanceof Error ? e.message : String(e) }, []);
      return;
    }
    p.handle = this.io.schedule(() => this.loop(p), p.intervalMs);
  }

  /** One night of the race; stops (and reports) after the last one. */
  private raceLoop(p: Player): void {
    const race = this.race;
    if (!race || race.run.done) {
      this.stopPlaying();
      return;
    }
    try {
      race.run.step();
      const { frame, transfer } = this.raceFrame();
      this.io.emit({ kind: "frame", frame }, transfer);
      if (race.run.done) {
        this.stopPlaying();
        this.io.emit({ kind: "race-complete", outcomes: race.run.outcomes() }, []);
        return;
      }
    } catch (e) {
      this.stopPlaying();
      this.io.emit({ kind: "stopped", timeline: RACE_TIMELINE, error: e instanceof Error ? e.message : String(e) }, []);
      return;
    }
    p.handle = this.io.schedule(() => this.loop(p), p.intervalMs);
  }

  /** The baseline city, with each candidate's event visitors (from its own future) sent to its host. */
  private raceFrame(): { frame: Frame; transfer: ArrayBuffer[] } {
    const { run, hosts, seen } = this.race!;
    const built = buildFrame(run.baseline, RACE_TIMELINE, run.startTick, false, this.epoch);
    const group = new Int8Array(built.frame.attendance.length).fill(-1);
    const went = new Uint8Array(group.length);
    const { tonight, total } = run.tallies();
    // Many residents go to the event in several futures. Each resident's own dot goes to one of
    // them (`group`, spread so every venue gets its share); the renderer adds a walker for each other
    // venue in `went`, so every venue shows exactly its count.
    const slots = hosts.map((_, k) => run.eventSlot(k));
    const forks = hosts.map((_, k) => run.fork(k));
    const shown = hosts.map(() => 0);
    const shared: number[] = [];
    for (let i = 0; i < group.length; i++) {
      let count = 0;
      for (let k = 0; k < hosts.length; k++) if (slots[k] >= 0 && forks[k].attendance[i] === slots[k]) { went[i] |= 1 << k; count++; }
      if (count === 1) {
        group[i] = 31 - Math.clz32(went[i]);
        shown[group[i]]++;
      } else if (count > 1) shared.push(i);
    }
    for (const i of shared) {
      let pick = -1;
      for (let k = 0; k < hosts.length; k++) {
        if (!(went[i] & (1 << k))) continue;
        if (pick < 0 || shown[k] / tonight[k] < shown[pick] / tonight[pick]) pick = k;
      }
      group[i] = pick;
      shown[pick]++;
    }
    for (let i = 0; i < group.length; i++) if (group[i] >= 0) built.frame.attendance[i] = hosts[group[i]];
    for (let i = 0; i < group.length; i++) if (group[i] >= 0 && seen[i] < 0) seen[i] = group[i];
    const seenCopy = seen.slice();
    built.frame.race = { hosts: [...hosts], group, went, seen: seenCopy, tonight, total, night: run.elapsed, nights: run.ticks };
    return { frame: built.frame, transfer: [...built.transfer, group.buffer as ArrayBuffer, went.buffer as ArrayBuffer, seenCopy.buffer as ArrayBuffer] };
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
        this.completeCase("interrupted");
        this.stopPlaying();
        this.timelines.clear();
        this.race = null;
        this.forks = 0;
        this.epoch++;
        this.timelines.set(MAIN_TIMELINE, t);
        return { timeline: MAIN_TIMELINE, digest: digest(t.state) };
      }
      case "act": {
        const t = this.timeline(cmd.timeline);
        const action = parseAction(cmd.action);
        const validation = validateAction(t.state, action);
        if (validation) throw new Error(validation);
        // A new mutation explicitly ends observation before it can interleave.
        if (this.activeCase?.timeline === cmd.timeline) this.completeCase("interrupted");
        const error = t.queue(action);
        if (error) throw new Error(error);
        return { queued: true };
      }
      case "run": {
        if (!Number.isInteger(cmd.ticks) || cmd.ticks < 1 || cmd.ticks > MAX_TICKS_PER_RUN) {
          throw new Error(`ticks must be an integer in [1, ${MAX_TICKS_PER_RUN}]`);
        }
        const t = this.timeline(cmd.timeline);
        if (this.activeCase?.timeline === cmd.timeline) this.completeCase("interrupted");
        const results = t.advance(cmd.ticks);
        return { digest: digest(t.state), results };
      }
      case "rewind": {
        const t = this.timeline(cmd.timeline);
        if (this.activeCase?.timeline === cmd.timeline) this.completeCase("interrupted");
        if (this.player?.timeline === cmd.timeline) this.stopPlaying();
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
        if (this.activeCase?.timeline === cmd.timeline) this.completeCase("interrupted");
        if (this.player?.timeline === cmd.timeline) this.stopPlaying();
        this.timelines.delete(cmd.timeline);
        return { disposed: true };
      }
      case "startCase": {
        this.checkSpeed(cmd.ticksPerSecond);
        if (cmd.autoplay !== undefined && typeof cmd.autoplay !== "boolean") throw new Error("invalid case autoplay");
        const t = this.timeline(cmd.timeline);
        const monitor = new CaseMonitor(t.state, cmd.spec);
        this.completeCase("interrupted");
        this.stopPlaying();
        this.activeCase = { timeline: cmd.timeline, monitor };
        const completion = monitor.completion(t.state);
        if (completion) this.completeCase(completion);
        else if (cmd.autoplay !== false) this.startPlaying(cmd.timeline, cmd.ticksPerSecond);
        return { started: true };
      }
      case "finishCase": {
        this.timeline(cmd.timeline);
        if (this.activeCase?.timeline === cmd.timeline) this.completeCase("finished");
        return { finished: true };
      }
      case "play": {
        this.checkSpeed(cmd.ticksPerSecond);
        if (cmd.timeline === RACE_TIMELINE) {
          if (!this.race) throw new Error("no race to play");
          this.completeCase("interrupted");
          this.startPlaying(RACE_TIMELINE, cmd.ticksPerSecond);
          return { playing: true };
        }
        this.timeline(cmd.timeline);
        if (this.activeCase && this.activeCase.timeline !== cmd.timeline) this.completeCase("interrupted");
        this.startPlaying(cmd.timeline, cmd.ticksPerSecond);
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
      case "book": {
        const s = this.timeline(cmd.timeline).state;
        if (!isIndex(cmd.venue, s.nVenues) || s.venueExpires[cmd.venue] >= 0) throw new Error(`unknown venue ${String(cmd.venue)}`);
        if (!(BOOKING_WEEKS as readonly number[]).includes(cmd.weeks)) throw new Error(`weeks must be one of ${BOOKING_WEEKS.join(", ")}`);
        const raw: unknown = cmd.acts;
        if (!Array.isArray(raw) || raw.length < 1 || raw.length > MAX_BOOKING_ACTS) throw new Error(`acts must list 1 to ${MAX_BOOKING_ACTS} acts`);
        const { reachKm, capacity, nearbyKm } = SCOUT_DEFAULTS;
        const acts: BookingAct[] = raw.map((a) => {
          const action = parseAction({ ...(a as object), type: "scheduleEvent", cell: s.venueCell[cmd.venue], duration: cmd.weeks, startTick: cmd.startTick, durationDays: cmd.durationDays, hostVenue: cmd.venue, reachKm, capacity });
          if (action.type !== "scheduleEvent") throw new Error("bad act");
          const error = validateAction(s, action);
          if (error) throw new Error(error);
          return { entity: action.entity, profile: action.profile };
        });
        return { results: bookActs(s, cmd.venue, acts, { weeks: cmd.weeks, startTick: cmd.startTick, durationDays: cmd.durationDays, runs: BOOKING_RUNS, reachKm, capacity, nearbyKm }), baselineTick: s.tick };
      }
      case "startRace": {
        const s = this.timeline(cmd.timeline).state;
        const r = cmd.race as RaceRequest;
        const entity = checkEntity(s, r?.entity);
        const hosts: unknown = r.hosts;
        if (!Array.isArray(hosts) || hosts.length < 1 || hosts.length > MAX_RACE_VENUES || new Set(hosts).size !== hosts.length) throw new Error(`hosts must list 1 to ${MAX_RACE_VENUES} different venues`);
        for (const h of hosts) if (!isIndex(h, s.nVenues) || !s.venueOpen[h] || s.venueExpires[h] >= 0) throw new Error(`venue ${String(h)} isn't open`);
        if (!Number.isInteger(r.nights) || r.nights < 1 || r.nights > MAX_RACE_NIGHTS) throw new Error(`nights must be 1 to ${MAX_RACE_NIGHTS}`);
        const { reachKm, capacity, nearbyKm } = SCOUT_DEFAULTS;
        const candidates = (hosts as number[]).map((host) => {
          const action = parseAction({ type: "scheduleEvent", entity, profile: r.profile, cell: s.venueCell[host], duration: 1, startTick: r.startTick, durationDays: r.nights, hostVenue: host, reachKm, capacity });
          if (action.type !== "scheduleEvent") throw new Error("bad race");
          const error = validateAction(s, action);
          if (error) throw new Error(error);
          return { entity, cell: action.cell, hostVenue: host, profile: action.profile };
        });
        const o: EventRunOptions = { weeks: 1, duration: 1, startTick: r.startTick, durationDays: r.nights, reachKm, capacity, nearbyKm, runs: RACE_RUNS };
        const runs = runEventCandidateRuns(s, candidates, o);
        if (this.player?.timeline === RACE_TIMELINE) this.stopPlaying();
        this.race = { run: new PairedEventRun(s, candidates, o, runSeed(s, 0)), hosts: hosts as number[], seen: new Int8Array(s.alive.length).fill(-1) };
        return { runs, frame: this.raceFrame().frame };
      }
      case "endRace":
        if (this.player?.timeline === RACE_TIMELINE) this.stopPlaying();
        this.race = null;
        return { ended: true };
      case "resident": {
        const s = this.timeline(cmd.timeline).state;
        const skip = cmd.skip ?? 0;
        if (!Number.isInteger(cmd.scene) || !Number.isInteger(skip) || skip < 0 || skip > 1000) throw new Error("bad resident request");
        const agent = typicalResident(s, cmd.scene, skip);
        return { profile: agent === null ? null : residentProfile(s, agent) };
      }
      default:
        throw new Error(`unknown command "${String((cmd as { type?: unknown }).type)}"`);
    }
  }
}
