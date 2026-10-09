import { describe, expect, it } from "vitest";
import { type HostIO, SimHost } from "@/sim/worker/host";
import type { FrameMessage, WorkerCommand } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

function fakeIo() {
  const scheduled: { fn: () => void; ms: number; handle: number }[] = [];
  const cancelled: unknown[] = [];
  const frames: FrameMessage[] = [];
  let next = 1;
  const io: HostIO = {
    emit: (message) => frames.push(message),
    schedule: (fn, ms) => {
      const handle = next++;
      scheduled.push({ fn, ms, handle });
      return handle;
    },
    cancel: (handle) => cancelled.push(handle),
  };
  return { io, scheduled, cancelled, frames, runNext: () => scheduled.shift()?.fn() };
}

const config = { nAgents: 200, agentReserve: 0 };
let id = 0;
const send = (host: SimHost, cmd: WorkerCommand) => host.handle({ ...cmd, id: ++id });

describe("SimHost streaming", () => {
  it("plays one tick per interval, pushing frames with a digest every 4th", () => {
    const f = fakeIo();
    const host = new SimHost(f.io);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    expect(send(host, { type: "play", timeline: "main", ticksPerSecond: 4 })).toMatchObject({ ok: true, result: { playing: true } });
    expect(f.scheduled[0].ms).toBe(250);
    for (let k = 0; k < 4; k++) f.runNext();
    expect(f.frames.map((m) => m.frame.tick)).toEqual([1, 2, 3, 4]);
    expect(f.frames.map((m) => m.frame.digest !== undefined)).toEqual([false, false, false, true]);
    expect(f.scheduled).toHaveLength(1);
  });

  it("pauses: cancels the pending tick and ignores stale callbacks", () => {
    const f = fakeIo();
    const host = new SimHost(f.io);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    send(host, { type: "play", timeline: "main", ticksPerSecond: 2 });
    const pending = f.scheduled[0];
    expect(send(host, { type: "pause" })).toMatchObject({ ok: true, result: { playing: false } });
    expect(f.cancelled).toContain(pending.handle);
    pending.fn();
    expect(f.frames).toHaveLength(0);
  });

  it("stops playing on re-init and when the playing timeline is disposed", () => {
    const f = fakeIo();
    const host = new SimHost(f.io);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    send(host, { type: "play", timeline: "main", ticksPerSecond: 2 });
    send(host, { type: "init", world: makeTinyWorld(), seed: 2, config });
    expect(f.cancelled).toHaveLength(1);
    send(host, { type: "fork", timeline: "main" });
    send(host, { type: "play", timeline: "fork-1", ticksPerSecond: 2 });
    send(host, { type: "dispose", timeline: "fork-1" });
    expect(f.cancelled).toHaveLength(2);
  });

  it("validates play and serves one-off frames with a digest", () => {
    const host = new SimHost(fakeIo().io);
    send(host, { type: "init", world: makeTinyWorld(), seed: 1, config });
    expect(send(host, { type: "play", timeline: "main", ticksPerSecond: 0 }).ok).toBe(false);
    expect(send(host, { type: "play", timeline: "main", ticksPerSecond: 100 }).ok).toBe(false);
    expect(send(host, { type: "play", timeline: "nope", ticksPerSecond: 2 }).ok).toBe(false);
    const r = send(host, { type: "frame", timeline: "main" });
    if (!r.ok) throw new Error(r.error);
    const { frame } = r.result as { frame: { tick: number; digest?: unknown } };
    expect(frame.tick).toBe(0);
    expect(frame.digest).toBeDefined();
  });
});
