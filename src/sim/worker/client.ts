import type { Action } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { Frame } from "@/sim/frame";
import type { CommandResults, WorkerCommand, WorkerMessage } from "@/sim/worker/protocol";

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

  constructor(private readonly worker: WorkerLike) {
    worker.addEventListener("message", (e) => {
      const data = e.data;
      if ("kind" in data) {
        for (const listener of this.frameListeners) listener(data.frame);
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
  play(timeline: string, ticksPerSecond: number) {
    return this.request<"play">({ type: "play", timeline, ticksPerSecond });
  }
  pause() {
    return this.request<"pause">({ type: "pause" });
  }
  frame(timeline: string) {
    return this.request<"frame">({ type: "frame", timeline });
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
