import { expect, it } from "vitest";
import type { EventOutcome } from "@/sim/events";
import { type HostIO, SimHost } from "@/sim/worker/host";
import type { CommandResults, FrameMessage, RaceCompleteMessage, WorkerCommand, WorkerResponse } from "@/sim/worker/protocol";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

function fakeIo() {
  const scheduled: (() => void)[] = [];
  const frames: FrameMessage[] = [];
  const complete: RaceCompleteMessage[] = [];
  const io: HostIO = {
    emit: (message) => {
      if (message.kind === "frame") frames.push(message);
      else if (message.kind === "race-complete") complete.push(message);
    },
    schedule: (fn) => scheduled.push(fn),
    cancel: () => {},
  };
  return { io, scheduled, frames, complete, runNext: () => scheduled.shift()?.() };
}

let id = 0;
const send = (host: SimHost, cmd: WorkerCommand) => host.handle({ ...cmd, id: ++id });
const ok = <T,>(r: WorkerResponse) => {
  if (!r.ok) throw new Error(r.error);
  return r.result as T;
};
const config = { nAgents: 400, agentReserve: 0, ticksPerWeek: 7, autoOpen: false };

it("plays a venue race night by night, matching future 1 of its forecast, without touching the city", () => {
  const f = fakeIo();
  const host = new SimHost(f.io);
  ok(send(host, { type: "init", world: makeTinyWorld(), seed: 2, config }));
  ok(send(host, { type: "run", timeline: "main", ticks: 7 }));
  const before = ok<CommandResults["frame"]>(send(host, { type: "frame", timeline: "main" })).frame;
  const race = { entity: 5, hosts: [0, 1], startTick: before.tick + 1, nights: 2 };
  const started = ok<CommandResults["startRace"]>(send(host, { type: "startRace", timeline: "main", race }));
  expect(started.runs).toHaveLength(3);
  expect(started.frame.race).toMatchObject({ hosts: [0, 1], night: 0, nights: 2, total: [0, 0] });

  ok(send(host, { type: "play", timeline: "race", ticksPerSecond: 4 }));
  while (f.scheduled.length) f.runNext();
  expect(f.frames.map((m) => m.frame.race!.night)).toEqual([1, 2]);
  const last = f.frames.at(-1)!.frame;
  const expected = started.runs[0].map((r: EventOutcome) => r.turnout);
  expect(expected.some((t) => t > 0)).toBe(true);
  expect(last.race!.total).toEqual(expected);
  expect(last.race!.group.some((g) => g >= 0)).toBe(true);
  // Everyone who went on any night is remembered with the first venue they went to.
  for (const m of f.frames) for (let i = 0; i < m.frame.race!.group.length; i++) if (m.frame.race!.group[i] >= 0) expect(last.race!.seen[i]).toBeGreaterThanOrEqual(0);
  expect(f.complete[0].outcomes.map((r) => r.turnout)).toEqual(expected);
  // Each candidate's visitors are drawn at its host venue.
  for (let i = 0; i < last.race!.group.length; i++) if (last.race!.group[i] >= 0) expect(last.attendance[i]).toBe(race.hosts[last.race!.group[i]]);

  const after = ok<CommandResults["frame"]>(send(host, { type: "frame", timeline: "main" })).frame;
  expect(after.tick).toBe(before.tick);
  expect(after.scheduledEvents).toEqual([]);
  ok(send(host, { type: "endRace" }));
  expect(send(host, { type: "play", timeline: "race", ticksPerSecond: 4 })).toMatchObject({ ok: false });
});

it("rejects races with repeated, closed or too many venues", () => {
  const host = new SimHost(fakeIo().io);
  ok(send(host, { type: "init", world: makeTinyWorld(), seed: 2, config }));
  const base = { entity: 5, startTick: 0, nights: 1 };
  expect(send(host, { type: "startRace", timeline: "main", race: { ...base, hosts: [0, 0] } })).toMatchObject({ ok: false });
  expect(send(host, { type: "startRace", timeline: "main", race: { ...base, hosts: [0, 1, 2, 3] } })).toMatchObject({ ok: false });
  expect(send(host, { type: "startRace", timeline: "main", race: { ...base, hosts: [0], nights: 9 } })).toMatchObject({ ok: false });
});
