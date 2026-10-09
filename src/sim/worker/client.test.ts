import { describe, expect, it } from "vitest";
import { SimClient, type WorkerLike } from "@/sim/worker/client";
import { SimHost } from "@/sim/worker/host";
import type { WorkerRequest, WorkerResponse } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

/** In-process stand-in for a Web Worker: same message flow, asynchronous like the real thing. */
function fakeWorker(): WorkerLike {
  const host = new SimHost();
  const listeners: ((e: MessageEvent<WorkerResponse>) => void)[] = [];
  return {
    postMessage: (message) =>
      queueMicrotask(() => {
        const response = host.handle(message as WorkerRequest);
        listeners.forEach((l) => l({ data: response } as MessageEvent<WorkerResponse>));
      }),
    addEventListener: (_type, listener) => listeners.push(listener),
    terminate: () => {},
  };
}

describe("SimClient", () => {
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
});
