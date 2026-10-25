import { describe, expect, it } from "vitest";
import { SimClient, type WorkerLike } from "@/sim/worker/client";
import { SimHost } from "@/sim/worker/host";
import type { WorkerMessage, WorkerRequest, WorkerResponse } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

type FakeWorker = WorkerLike & { emit(type: "error" | "messageerror", message?: string): void };

/** In-process stand-in for a Web Worker: same message flow, asynchronous like the real thing. */
function fakeWorker(): FakeWorker {
  const host = new SimHost();
  const listeners: ((e: MessageEvent<WorkerResponse>) => void)[] = [];
  const errorListeners = new Map<string, ((e: Event) => void)[]>();
  return {
    postMessage: (message) =>
      queueMicrotask(() => {
        const response = host.handle(message as WorkerRequest);
        listeners.forEach((l) => l({ data: response } as MessageEvent<WorkerResponse>));
      }),
    addEventListener: ((type: string, listener: (e: never) => void) => {
      if (type === "message") listeners.push(listener as (e: MessageEvent<WorkerResponse>) => void);
      else errorListeners.set(type, [...(errorListeners.get(type) ?? []), listener as (e: Event) => void]);
    }) as WorkerLike["addEventListener"],
    terminate: () => {},
    emit: (type, message) => errorListeners.get(type)?.forEach((l) => l({ type, message } as unknown as Event)),
  };
}

describe("SimClient", () => {
  it("round-trips case commands and independently subscribes to completion", async () => {
    const host = new SimHost();
    const listeners: ((e: MessageEvent<WorkerMessage>) => void)[] = [];
    const worker: WorkerLike = {
      postMessage: (message) => queueMicrotask(() => {
        const response = host.handle(message as WorkerRequest);
        listeners.forEach((listener) => listener({ data: response } as MessageEvent<WorkerMessage>));
      }),
      addEventListener: ((type: string, listener: (e: MessageEvent<WorkerMessage>) => void) => {
        if (type === "message") listeners.push(listener);
      }) as WorkerLike["addEventListener"],
      terminate: () => {},
    };
    const client = new SimClient(worker);
    await client.init(makeTinyWorld(), 1, { nAgents: 20, agentReserve: 0 });
    await expect(client.startCase("main", { id: "test", startTick: 0, maxTicks: 5, venueSlots: [], agentSlots: [] }, 4)).resolves.toEqual({ started: true });
    await expect(client.finishCase("main")).resolves.toEqual({ finished: true });
    const seen: string[] = [];
    const unsubscribe = client.onCaseComplete((message) => seen.push(message.report.id));
    const report = { id: "completed", startTick: 0, endTick: 5, reason: "limit" as const, observedTicks: 5, visits: 0, uniqueVisitors: 0, cohortOutings: 0, venues: [], settledHeuristic: false };
    const emit = () => listeners.forEach((listener) => listener(new MessageEvent<WorkerMessage>("message", { data: { kind: "case-complete", timeline: "main", report } })));
    emit(); unsubscribe(); emit();
    expect(seen).toEqual(["completed"]);
  });
  it("round-trips commands through the worker protocol", async () => {
    const client = new SimClient(fakeWorker());
    const init = await client.init(makeTinyWorld(), 1, { nAgents: 200, agentReserve: 0 });
    expect(init.timeline).toBe("main");
    const run = await client.run("main", 3);
    expect(run.digest.tick).toBe(3);
    await expect(client.act("main", { type: "closeVenue", venue: 999 })).rejects.toThrow(/unknown venue/);
    const fork = await client.fork("main");
    expect(fork.timeline).toBe("fork-1");
  });

  it("rejects pending requests when terminated", async () => {
    const worker = fakeWorker();
    const client = new SimClient({ ...worker, postMessage: () => {} });
    const pending = client.digest("main");
    client.terminate();
    await expect(pending).rejects.toThrow(/terminated/);
  });

  it("rejects pending requests when the worker errors", async () => {
    const worker = fakeWorker();
    const client = new SimClient({ ...worker, postMessage: () => {} });
    const pending = client.digest("main");
    worker.emit("error", "boom");
    await expect(pending).rejects.toThrow(/worker error: boom/);
  });

  it("rejects pending requests on messageerror", async () => {
    const worker = fakeWorker();
    const client = new SimClient({ ...worker, postMessage: () => {} });
    const pending = client.digest("main");
    worker.emit("messageerror");
    await expect(pending).rejects.toThrow(/worker error/);
  });

  it("rejects requests made after terminate", async () => {
    const client = new SimClient(fakeWorker());
    client.terminate();
    await expect(client.digest("main")).rejects.toThrow(/terminated/);
  });
});
