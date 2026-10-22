import type { Action } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { CaseSpec } from "@/sim/case";
import type { Frame } from "@/sim/frame";
import type { CaseCompleteMessage, CommandResults, StoppedMessage, WorkerCommand, WorkerMessage } from "@/sim/worker/protocol";

/** The subset of the Worker API the client needs (lets tests use an in-process fake). */
export type WorkerLike = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: MessageEvent<WorkerMessage>) => void): void;
  addEventListener(type: "error" | "messageerror", listener: (e: Event) => void): void;
  terminate(): void;
};

type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void };

/** Promise-based API over the simulation worker. */
export class SimClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private terminated = false;
  private readonly frameListeners = new Set<(frame: Frame) => void>();
  private readonly stoppedListeners = new Set<(message: StoppedMessage) => void>();
  private readonly caseListeners = new Set<(message: CaseCompleteMessage) => void>();

  constructor(private readonly worker: WorkerLike) {
    worker.addEventListener("message", (e) => {
      const data = e.data;
      if ("kind" in data) {
        if (data.kind === "frame") for (const listener of this.frameListeners) listener(data.frame);
        else if (data.kind === "stopped") for (const listener of this.stoppedListeners) listener(data);
        else if (data.kind === "case-complete") for (const listener of this.caseListeners) listener(data);
        return;
      }
      const p = this.pending.get(data.id);
      if (!p) return;
      this.pending.delete(data.id);
      if (data.ok) p.resolve(data.result);
      else p.reject(new Error(data.error));
    });
    const onFailure = (e: Event) => {
      const message = (e as { message?: unknown }).message;
      this.rejectAll(new Error(`worker error${typeof message === "string" && message ? `: ${message}` : ""}`));
    };
    worker.addEventListener("error", onFailure);
    worker.addEventListener("messageerror", onFailure);
  }

  /** Browser only: spawns the simulation Web Worker. */
  static spawn(): SimClient {
    const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    return new SimClient(worker as unknown as WorkerLike);
  }

  private request<K extends WorkerCommand["type"]>(cmd: Extract<WorkerCommand, { type: K }>): Promise<CommandResults[K]> {
    if (this.terminated) return Promise.reject(new Error("worker terminated"));
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve: resolve as (result: unknown) => void, reject });
      this.worker.postMessage({ ...cmd, id });
    });
  }

  init(world: unknown, seed: number, config?: Partial<SimConfig>) {
    return this.request<"init">({ type: "init", world, seed, config });
  }
  act(timeline: string, action: Action) {
    return this.request<"act">({ type: "act", timeline, action });
  }
  run(timeline: string, ticks: number) {
    return this.request<"run">({ type: "run", timeline, ticks });
  }
  rewind(timeline: string, tick: number) {
    return this.request<"rewind">({ type: "rewind", timeline, tick });
  }
  fork(timeline: string) {
    return this.request<"fork">({ type: "fork", timeline });
  }
  digest(timeline: string) {
    return this.request<"digest">({ type: "digest", timeline });
  }
  dispose(timeline: string) {
    return this.request<"dispose">({ type: "dispose", timeline });
  }
  /** Subscribes to frames pushed while playing; returns an unsubscribe function. */
  onFrame(listener: (frame: Frame) => void): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }
  /** Subscribes to the worker stopping playback after a failed tick; returns an unsubscribe function. */
  onStopped(listener: (message: StoppedMessage) => void): () => void {
    this.stoppedListeners.add(listener);
    return () => {
      this.stoppedListeners.delete(listener);
    };
  }
  onCaseComplete(listener: (message: CaseCompleteMessage) => void): () => void {
    this.caseListeners.add(listener);
    return () => { this.caseListeners.delete(listener); };
  }
  startCase(timeline: string, spec: CaseSpec, ticksPerSecond: number) {
    return this.request<"startCase">({ type: "startCase", timeline, spec, ticksPerSecond });
  }
  finishCase(timeline: string) {
    return this.request<"finishCase">({ type: "finishCase", timeline });
  }
  play(timeline: string, ticksPerSecond: number) {
    return this.request<"play">({ type: "play", timeline, ticksPerSecond });
  }
  pause() {
    return this.request<"pause">({ type: "pause" });
  }
  frame(timeline: string) {
    return this.request<"frame">({ type: "frame", timeline });
  }
  /** Per-cell demand for `entity` plus up to 3 well-spaced candidate cells. */
  demand(timeline: string, entity: number) {
    return this.request<"demand">({ type: "demand", timeline, entity });
  }
  /** Simulates an event for `entity` at each cell in forked futures; results come ranked, best first. */
  scout(timeline: string, entity: number, cells: number[], weeks?: number) {
    return this.request<"scout">({ type: "scout", timeline, entity, cells, weeks });
  }

  /** Book for my venue: `acts` ({ entity, profile? }) compared at `venue` for `weeks`. */
  book(timeline: string, venue: number, acts: unknown[], weeks: number, date: { startTick?: number; durationDays?: number } = {}) {
    return this.request<"book">({ type: "book", timeline, venue, acts, weeks, ...date });
  }

  /** A typical member of `scene` (skipping the `skip` most typical), or null. */
  resident(timeline: string, scene: number, skip?: number) {
    return this.request<"resident">({ type: "resident", timeline, scene, skip });
  }

  /** "What happens if…": `actions` on a fork versus a no-action baseline, `weeks` ahead. */
  whatIf(timeline: string, actions: unknown[], weeks: number) {
    return this.request<"whatIf">({ type: "whatIf", timeline, actions, weeks });
  }

  /** Stops the worker and rejects anything still waiting. */
  terminate(): void {
    this.terminated = true;
    this.worker.terminate();
    this.rejectAll(new Error("worker terminated"));
  }

  private rejectAll(error: Error): void {
    const pending = [...this.pending.values()];
    this.pending.clear();
    for (const p of pending) p.reject(error);
  }
}
