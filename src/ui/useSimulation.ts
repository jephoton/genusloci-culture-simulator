"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import type { FrameStore } from "@/render/frame-store";
import type { Action } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { SimDigest } from "@/sim/digest";
import type { Frame } from "@/sim/frame";
import { SimClient } from "@/sim/worker/client";
import { MAIN_TIMELINE } from "@/sim/worker/protocol";
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
  act(action: Action): Promise<void>;
  rewind(tick: number): Promise<void>;
  dismissError(): void;
};

const DEFAULT_SPEED = 2;
const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Owns the simulation worker: initialises the world, streams frames, and applies user actions. */
export function useSimulation(world: World, seed: number, config: Partial<SimConfig>): Simulation {
  const clientRef = useRef<SimClient | null>(null);
  const frames = useRef<FrameStore>({ current: null, previous: null, receivedAt: 0 });
  const playingRef = useRef(false);
  const speedRef = useRef(DEFAULT_SPEED);
  const [frame, setFrame] = useState<Frame | null>(null);
  const [digest, setDigest] = useState<SimDigest | null>(null);
  const [status, setStatus] = useState<SimStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeedState] = useState(DEFAULT_SPEED);

  const accept = useCallback((f: Frame) => {
    frames.current = { previous: frames.current.current, current: f, receivedAt: performance.now() };
    setFrame(f);
    if (f.digest) setDigest(f.digest);
  }, []);

  useEffect(() => {
    const client = SimClient.spawn();
    clientRef.current = client;
    const off = client.onFrame(accept);
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
      client.terminate();
      clientRef.current = null;
      playingRef.current = false;
    };
  }, [world, seed, config, accept]);

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
    setPlaying(true);
    client.play(MAIN_TIMELINE, speedRef.current).catch(report);
  }, [report]);

  const pause = useCallback(() => {
    const client = clientRef.current;
    if (!client) return;
    playingRef.current = false;
    setPlaying(false);
    client.pause().catch(report);
  }, [report]);

  const setSpeed = useCallback(
    (ticksPerSecond: number) => {
      speedRef.current = ticksPerSecond;
      setSpeedState(ticksPerSecond);
      if (playingRef.current) clientRef.current?.play(MAIN_TIMELINE, ticksPerSecond).catch(report);
    },
    [report],
  );

  const act = useCallback(
    async (action: Action) => {
      const client = clientRef.current;
      if (!client) return;
      try {
        setError(null);
        await client.act(MAIN_TIMELINE, action);
        if (!playingRef.current) {
          const result = await client.run(MAIN_TIMELINE, 1);
          setDigest(result.digest);
          await refresh();
        }
      } catch (e) {
        report(e);
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

  const dismissError = useCallback(() => setError(null), []);

  return { status, error, playing, speed, frame, digest, frames, play, pause, setSpeed, act, rewind, dismissError };
}
