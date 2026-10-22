import { describe, expect, it, vi } from "vitest";
import { Timeline } from "@/sim/timeline";
import { SimHost, type HostIO } from "@/sim/worker/host";
import type { WorkerCommand, WorkerMessage } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

function setup() {
  const messages: WorkerMessage[] = [];
  const callbacks = new Map<number, () => void>();
  let timer = 0;
  const io: HostIO = { emit: (m) => messages.push(m), schedule: (fn) => { callbacks.set(++timer, fn); return timer; }, cancel: (h) => { callbacks.delete(h as number); } };
  const host = new SimHost(io);
  let id = 0;
  const send = (cmd: WorkerCommand) => host.handle({ ...cmd, id: ++id });
  const tick = () => { const entry = callbacks.entries().next().value; if (entry) { callbacks.delete(entry[0]); entry[1](); } };
  send({ type: "init", world: makeTinyWorld(), seed: 1, config: { nAgents: 30, agentReserve: 0 } });
  const start = (maxTicks = 4, startTick = 0) => send({ type: "startCase", timeline: "main", spec: { id: "case", startTick, maxTicks, venueSlots: [0], agentSlots: [] }, ticksPerSecond: 10 });
  return { send, tick, start, callbacks, messages, reports: () => messages.filter((m) => "kind" in m && m.kind === "case-complete") };
}

describe("worker live cases", () => {
  it("caps exactly, emits once, and leaves no scheduled tick", () => {
    const h = setup();
    expect(h.start().ok).toBe(true);
    for (let i = 0; i < 8; i++) h.tick();
    expect(h.reports()).toHaveLength(1);
    expect(h.reports()[0]).toMatchObject({ report: { reason: "limit", endTick: 4, observedTicks: 4 } });
    expect(h.callbacks.size).toBe(0);
  });
  it("retains observation through pause, speed changes, and ordinary play", () => {
    const h = setup(); h.start(); h.tick();
    h.send({ type: "pause" }); h.tick();
    expect(h.reports()).toHaveLength(0);
    h.send({ type: "play", timeline: "main", ticksPerSecond: 20 }); h.tick();
    h.send({ type: "play", timeline: "main", ticksPerSecond: 5 }); h.tick(); h.tick();
    expect(h.reports()[0]).toMatchObject({ report: { endTick: 4, observedTicks: 4 } });
  });
  it("counts duration before monitoring and completes immediately at the limit", () => {
    const h = setup(); h.send({ type: "run", timeline: "main", ticks: 4 }); h.start();
    expect(h.reports()[0]).toMatchObject({ report: { reason: "limit", endTick: 4, observedTicks: 0 } });
    expect(h.callbacks.size).toBe(0);
  });
  it.each(["run", "act", "rewind", "init"] as const)("interrupts once before %s mutates state", (command) => {
    const h = setup(); h.start(); h.tick();
    if (command === "run") h.send({ type: command, timeline: "main", ticks: 2 });
    if (command === "act") h.send({ type: command, timeline: "main", action: { type: "closeVenue", venue: 0 } });
    if (command === "rewind") h.send({ type: command, timeline: "main", tick: 0 });
    if (command === "init") h.send({ type: command, world: makeTinyWorld(), seed: 2, config: { nAgents: 30 } });
    h.tick();
    expect(h.reports()).toHaveLength(1);
    expect(h.reports()[0]).toMatchObject({ report: { reason: "interrupted", endTick: 1 } });
    expect(h.callbacks.size).toBe(0);
  });
  it("finishes manually once and rejects malformed specs/speeds", () => {
    const h = setup(); h.start(); h.tick();
    h.send({ type: "finishCase", timeline: "main" }); h.send({ type: "finishCase", timeline: "main" });
    expect(h.reports()).toHaveLength(1);
    expect(h.reports()[0]).toMatchObject({ report: { reason: "finished" } });
    expect(h.send({ type: "startCase", timeline: "main", spec: { id: "", startTick: 0, maxTicks: 3, venueSlots: [], agentSlots: [] }, ticksPerSecond: 10 }).ok).toBe(false);
    expect(h.send({ type: "startCase", timeline: "main", spec: { id: "ok", startTick: 0, maxTicks: 3, venueSlots: [], agentSlots: [] }, ticksPerSecond: Infinity }).ok).toBe(false);
  });
  it("invalidates stale callbacks and emits interrupted before disposal of a fork", () => {
    const h = setup();
    h.send({ type: "fork", timeline: "main" });
    h.send({ type: "startCase", timeline: "fork-1", spec: { id: "fork", startTick: 0, maxTicks: 5, venueSlots: [], agentSlots: [] }, ticksPerSecond: 2 });
    const stale = [...h.callbacks.values()][0];
    h.send({ type: "dispose", timeline: "fork-1" }); stale();
    expect(h.reports()).toHaveLength(1);
    expect(h.reports()[0]).toMatchObject({ timeline: "fork-1", report: { reason: "interrupted", endTick: 0 } });
    expect(h.callbacks.size).toBe(0);
  });
  it("preserves stopped errors and completes an active case only once after tick failure", () => {
    const h = setup(); h.start();
    const spy = vi.spyOn(Timeline.prototype, "advance").mockImplementationOnce(() => { throw new Error("tick failed"); });
    h.tick(); spy.mockRestore(); h.tick();
    expect(h.reports()).toHaveLength(1);
    expect(h.reports()[0]).toMatchObject({ report: { reason: "interrupted" } });
    expect(h.messages).toContainEqual({ kind: "stopped", timeline: "main", error: "tick failed" });
    expect(h.callbacks.size).toBe(0);
  });
});
