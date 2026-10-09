import { describe, expect, it } from "vitest";
import { SimHost } from "@/sim/worker/host";
import type { WorkerCommand, WorkerResponse } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const config = { nAgents: 300, agentReserve: 50 };
let id = 0;
const send = (host: SimHost, cmd: WorkerCommand): WorkerResponse => host.handle({ ...cmd, id: ++id });
const ok = (r: WorkerResponse) => {
  if (!r.ok) throw new Error(r.error);
  return r.result as Record<string, unknown> & { digest: { tick: number; recentActions: unknown[] } };
};

describe("SimHost", () => {
  it("initialises the main timeline and runs it", () => {
    const host = new SimHost();
    const init = ok(send(host, { type: "init", world: makeTinyWorld(), seed: 1, config }));
    expect(init.timeline).toBe("main");
    expect(init.digest.tick).toBe(0);
    expect(ok(send(host, { type: "run", timeline: "main", ticks: 5 })).digest.tick).toBe(5);
  });

  it("queues valid actions and reports invalid ones", () => {
    const host = new SimHost();
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    expect(ok(send(host, { type: "act", timeline: "main", action: { type: "closeVenue", venue: 0 } }))).toEqual({ queued: true });
    expect(ok(send(host, { type: "run", timeline: "main", ticks: 1 })).digest.recentActions).toHaveLength(1);
    const bad = send(host, { type: "act", timeline: "main", action: { type: "closeVenue", venue: 999 } });
    expect(bad.ok).toBe(false);
    expect(send(host, { type: "act", timeline: "main", action: { type: "nope" } }).ok).toBe(false);
  });

  it("forks, rewinds and disposes timelines", () => {
    const host = new SimHost();
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    send(host, { type: "run", timeline: "main", ticks: 4 });
    const fork = ok(send(host, { type: "fork", timeline: "main" }));
    expect(fork.timeline).toBe("fork-1");
    send(host, { type: "run", timeline: "fork-1", ticks: 3 });
    expect(ok(send(host, { type: "digest", timeline: "main" })).digest.tick).toBe(4);
    expect(ok(send(host, { type: "rewind", timeline: "fork-1", tick: 2 })).digest.tick).toBe(2);
    expect(ok(send(host, { type: "dispose", timeline: "fork-1" }))).toEqual({ disposed: true });
    expect(send(host, { type: "digest", timeline: "fork-1" }).ok).toBe(false);
    expect(send(host, { type: "dispose", timeline: "main" }).ok).toBe(false);
  });

  it("rejects an invalid init config and keeps the previous timeline", () => {
    const host = new SimHost();
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    ok(send(host, { type: "run", timeline: "main", ticks: 2 }));
    expect(send(host, { type: "init", world: makeTinyWorld(), seed: 1, config: { sceneEvery: 0 } }).ok).toBe(false);
    expect(ok(send(host, { type: "digest", timeline: "main" })).digest.tick).toBe(2);
  });

  it("rejects unknown commands", () => {
    const host = new SimHost();
    const res = host.handle({ id: 1, type: "bogus" } as never);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/unknown command/);
  });

  it("returns errors instead of throwing", () => {
    const host = new SimHost();
    expect(send(host, { type: "init", world: { nope: true }, seed: 1 }).ok).toBe(false);
    expect(send(host, { type: "run", timeline: "main", ticks: 1 }).ok).toBe(false);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    expect(send(host, { type: "run", timeline: "main", ticks: 0 }).ok).toBe(false);
  });
});
