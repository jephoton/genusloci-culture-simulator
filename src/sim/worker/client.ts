import type { Action } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { CommandResults, WorkerCommand, WorkerResponse } from "@/sim/worker/protocol";

/** The subset of the Worker API the client needs (lets tests use an in-process fake). */
export type WorkerLike = {
  postMessage(message: unknown): void;
  addEventListener(type: "message", listener: (e: MessageEvent<WorkerResponse>) => void): void;
  terminate(): void;
};

type Pending = { resolve: (result: unknown) => void; reject: (error: Error) => void };

/** Promise-based API over the simulation worker. */
export class SimClient {
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly worker: WorkerLike) {
    worker.addEventListener("message", (e) => {
      const p = this.pending.get(e.data.id);
      if (!p) return;
      this.pending.delete(e.data.id);
      if (e.data.ok) p.resolve(e.data.result);
      else p.reject(new Error(e.data.error));
    });
  }

  /** Browser only: spawns the simulation Web Worker. */
  static spawn(): SimClient {
    const worker = new Worker(new URL("./sim.worker.ts", import.meta.url), { type: "module" });
    return new SimClient(worker as unknown as WorkerLike);
  }

  private request<K extends WorkerCommand["type"]>(cmd: Extract<WorkerCommand, { type: K }>): Promise<CommandResults[K]> {
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

  /** Stops the worker and rejects anything still waiting. */
  terminate(): void {
    this.worker.terminate();
    for (const p of this.pending.values()) p.reject(new Error("worker terminated"));
    this.pending.clear();
  }
}
