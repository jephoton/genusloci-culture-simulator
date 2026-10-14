"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { SimClock } from "@/render/clock";
import type { FrameStore } from "@/render/frame-store";
import type { Action } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { SimDigest } from "@/sim/digest";
import type { Frame } from "@/sim/frame";
import { SimClient } from "@/sim/worker/client";
import { type CommandResults, MAIN_TIMELINE } from "@/sim/worker/protocol";
import type { World } from "@/world/schema";

export type SimStatus = "loading" | "ready" | "error";

export type Simulation = {
  status: SimStatus;
  error: string | null;
  playing: boolean;
  speed: number;
  frame: Frame | null;
  digest: SimDigest | null;
  frames: RefObject<FrameStore>;
  play(): void;
  pause(): void;
  setSpeed(ticksPerSecond: number): void;
  /** Resolves true once the action is accepted (queued, or applied while paused); false if it was rejected. */
  act(action: Action): Promise<boolean>;
  rewind(tick: number): Promise<void>;
  /** Per-cell demand for a headliner in the live city, plus up to 3 candidate cells. Rejects on failure. */
  demand(entity: number): Promise<CommandResults["demand"]>;
  /** Simulates a night for `entity` at each cell in forked futures (live city untouched). Rejects on failure. */
  scout(entity: number, cells: number[]): Promise<CommandResults["scout"]>;
  /** "What happens if…" on forked futures (live city untouched). Rejects on failure. */
  whatIf(actions: Action[], weeks: number): Promise<CommandResults["whatIf"]>;
  /** Book for my venue: compares acts at a venue for `weeks` (live city untouched). Rejects on failure. */
  book(venue: number, acts: { entity: number; profile?: { entity: number; weight: number }[] }[], weeks: number): Promise<CommandResults["book"]>;
  /** A typical member of a scene, for interviews (`skip` meets someone else). Rejects on failure. */
  resident(scene: number, skip?: number): Promise<CommandResults["resident"]>;
  /** The live city's digest right now (frames carry one only every few ticks). Rejects on failure. */
  latestDigest(): Promise<SimDigest>;
  dismissError(): void;
};

/** Ticks per second; each tick (a day in the demo) is drawn as a night out, so this needs to be slow enough to follow. */
const DEFAULT_SPEED = 1;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Owns the simulation worker: initialises the world, streams frames, and applies user actions. */
export function useSimulation(world: World, seed: number, config: Partial<SimConfig>): Simulation {
  const clientRef = useRef<SimClient | null>(null);
  const [clock] = useState(() => new SimClock());
  const frames = useRef<FrameStore>({ current: null, previous: null, receivedAt: 0, clock });
  const playingRef = useRef(false);
  const speedRef = useRef(DEFAULT_SPEED);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [digest, setDigest] = useState<SimDigest | null>(null);
  const [status, setStatus] = useState<SimStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(DEFAULT_SPEED);

  const accept = useCallback((f: Frame) => {
    const store = frames.current;
    store.previous = store.current;
    store.current = f;
    store.receivedAt = store.clock.now();
    setFrame(f);
    if (f.digest) setDigest(f.digest);
  }, []);

  useEffect(() => {
    const client = SimClient.spawn();
    clientRef.current = client;
    const off = client.onFrame(accept);
    const offStopped = client.onStopped(({ error: reason }) => {
      playingRef.current = false;
      clock.setPlaying(false, performance.now());
      setPlaying(false);
      setError(reason);
    });
    let cancelled = false;
    void (async () => {
      try {
        const init = await client.init(world, seed, config);
        if (cancelled) return;
        setDigest(init.digest);
        const { frame: first } = await client.frame(MAIN_TIMELINE);
        if (cancelled) return;
        accept(first);
        setStatus("ready");
      } catch (e) {
        if (cancelled) return;
        setError(message(e));
        setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
      off();
      offStopped();
      client.terminate();
      clientRef.current = null;
      playingRef.current = false;
      clock.setPlaying(false, performance.now());
    };
  }, [world, seed, config, accept, clock]);

  const report = useCallback((e: unknown) => setError(message(e)), []);

  const refresh = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    const { frame: latest } = await client.frame(MAIN_TIMELINE);
    accept(latest);
  }, [accept]);

  const play = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    playingRef.current = true;
    clock.setPlaying(true, performance.now());
    setPlaying(true);
    client.play(MAIN_TIMELINE, speedRef.current).catch((e: unknown) => {
      playingRef.current = false;
      clock.setPlaying(false, performance.now());
      setPlaying(false);
      report(e);
    });
  }, [clock, report]);

  const pause = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    // Freeze the animation clock first: a frame that still arrives after this waits, frozen, for play.
    playingRef.current = false;
    clock.setPlaying(false, performance.now());
    setPlaying(false);
    client.pause().catch(report);
  }, [clock, report]);

  const setSpeed = useCallback(
    (ticksPerSecond: number) => {
      speedRef.current = ticksPerSecond;
      setSpeedState(ticksPerSecond);
      if (playingRef.current) clientRef.current?.play(MAIN_TIMELINE, ticksPerSecond).catch(report);
    },
    [report],
  );

  const act = useCallback(
    async (action: Action): Promise<boolean> => {
      const client = clientRef.current;
      if (!client) return false;
      try {
        setError(null);
        await client.act(MAIN_TIMELINE, action);
        if (!playingRef.current) {
          const result = await client.run(MAIN_TIMELINE, 1);
          setDigest(result.digest);
          await refresh();
        }
        return true;
      } catch (e) {
        report(e);
        return false;
      }
    },
    [refresh, report],
  );

  const rewind = useCallback(
    async (tick: number) => {
      const client = clientRef.current;
      if (!client) return;
      try {
        const result = await client.rewind(MAIN_TIMELINE, tick);
        setDigest(result.digest);
        await refresh();
      } catch (e) {
        report(e);
      }
    },
    [refresh, report],
  );

  const demand = useCallback((entity: number) => {
    const client = clientRef.current;
    return client ? client.demand(MAIN_TIMELINE, entity) : Promise.reject(new Error("the simulation isn't running"));
  }, []);

  const scout = useCallback((entity: number, cells: number[]) => {
    const client = clientRef.current;
    return client ? client.scout(MAIN_TIMELINE, entity, cells) : Promise.reject(new Error("the simulation isn't running"));
  }, []);

  const whatIf = useCallback((actions: Action[], weeks: number) => {
    const client = clientRef.current;
    return client ? client.whatIf(MAIN_TIMELINE, actions, weeks) : Promise.reject(new Error("the simulation isn't running"));
  }, []);

  const book = useCallback((venue: number, acts: { entity: number; profile?: { entity: number; weight: number }[] }[], weeks: number) => {
    const client = clientRef.current;
    return client ? client.book(MAIN_TIMELINE, venue, acts, weeks) : Promise.reject(new Error("the simulation isn't running"));
  }, []);

  const resident = useCallback((scene: number, skip?: number) => {
    const client = clientRef.current;
    return client ? client.resident(MAIN_TIMELINE, scene, skip) : Promise.reject(new Error("the simulation isn't running"));
  }, []);

  const latestDigest = useCallback(async () => {
    const client = clientRef.current;
    if (!client) throw new Error("the simulation isn't running");
    const { digest: d } = await client.digest(MAIN_TIMELINE);
    setDigest(d);
    return d;
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  return {
    status, error, playing, speed, frame, digest, frames, play, pause, setSpeed, act, rewind, demand, scout, whatIf, book, resident, latestDigest, dismissError,
  };
}
