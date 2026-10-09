import { describe, expect, it } from "vitest";
import { SimClient, type WorkerLike } from "@/sim/worker/client";
import { SimHost } from "@/sim/worker/host";
import type { WorkerMessage, WorkerRequest } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

/** In-process worker whose play loop is driven manually with tick(). */
function streamingWorker() {
  const listeners: ((e: MessageEvent<WorkerMessage>) => void)[] = [];
  const queue: (() => void)[] = [];
  const deliver = (m: WorkerMessage) => listeners.forEach((l) => l({ data: m } as MessageEvent<WorkerMessage>));
  const host = new SimHost({
    emit: (m) => deliver(m),
    schedule: (fn) => queue.push(fn),
    cancel: () => {},
  });
  const worker: WorkerLike = {
    postMessage: (message) => queueMicrotask(() => deliver(host.handle(message as WorkerRequest))),
    addEventListener: ((type: string, listener: (e: MessageEvent<WorkerMessage>) => void) => {
      if (type === "message") listeners.push(listener);
    }) as WorkerLike["addEventListener"],
    terminate: () => {},
  };
  return { worker, tick: () => queue.shift()?.() };
}

describe("SimClient frames", () => {
  it("delivers pushed frames to onFrame listeners until unsubscribed", async () => {
    const { worker, tick } = streamingWorker();
    const client = new SimClient(worker);
    await client.init(makeTinyWorld(), 1, { nAgents: 200, agentReserve: 0 });
    const ticks: number[] = [];
    const off = client.onFrame((f) => ticks.push(f.tick));
    await client.play("main", 8);
    tick();
    tick();
    off();
    tick();
    expect(ticks).toEqual([1, 2]);
    const { frame } = await client.frame("main");
    expect(frame.tick).toBe(3);
    expect(await client.pause()).toEqual({ playing: false });
  });
});
