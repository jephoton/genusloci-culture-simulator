"use client";

import { type RefObject, useCallback, useEffect, useRef, useState } from "react";
import { SimClock } from "@/render/clock";
import type { FrameStore } from "@/render/frame-store";
import type { Action } from "@/sim/actions/schema";
import type { SimConfig } from "@/sim/config";
import type { SimDigest } from "@/sim/digest";
import type { Frame } from "@/sim/frame";
import type { CaseSpec, CaseReport } from "@/sim/case";
import { SimClient } from "@/sim/worker/client";
import { type CommandResults, MAIN_TIMELINE } from "@/sim/worker/protocol";
import { recordSizes, type SceneHistory } from "@/ui/scene-history";
import { CasePresentation } from "@/ui/case-presentation";
import type { World } from "@/world/schema";

export type SimStatus = "loading" | "ready" | "error";

export type Simulation = {
  activeCase: CaseSpec | null;
  caseReports: { report: CaseReport; at: number }[];
  caseChanges: { id: string; label: string; tick: number; status: string }[];
  startCase(spec: CaseSpec, label: string): Promise<void>;
  finishCase(): Promise<void>;
  status: SimStatus;
  error: string | null;
  playing: boolean;
  speed: number;
  frame: Frame | null;
  digest: SimDigest | null;
  frames: RefObject<FrameStore>;
  /** Scene sizes over the digests seen so far (for sparklines). */
  sceneHistory: SceneHistory;
  play(): void;
  pause(): void;
  setSpeed(ticksPerSecond: number): void;
  /** Resolves true once the action is accepted (queued, or applied while paused); false if it was rejected. */
  act(action: Action): Promise<boolean>;
  rewind(tick: number): Promise<boolean>;
  /** Per-cell demand for a headliner in the live city, plus up to 3 candidate cells. Rejects on failure. */
  demand(entity: number): Promise<CommandResults["demand"]>;
  /** Simulates a night for `entity` at each cell in forked futures (live city untouched). Rejects on failure. */
  scout(entity: number, cells: number[]): Promise<CommandResults["scout"]>;
  /** "What happens if…" on forked futures (live city untouched). Rejects on failure. */
  whatIf(actions: Action[], weeks: number): Promise<CommandResults["whatIf"]>;
  /** Book for my venue: compares acts at a venue for `weeks` (live city untouched). Rejects on failure. */
  book(venue: number, acts: { entity: number; profile?: { entity: number; weight: number }[] }[], weeks: number, date?: { startTick?: number; durationDays?: number }): Promise<CommandResults["book"]>;
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
  const [digest, setDigestState] = useState<SimDigest | null>(null);
  const [sceneHistory, setSceneHistory] = useState<SceneHistory>(() => new Map());
  /** Every digest also extends the scene-size history (rewinds trim it). */
  const setDigest = useCallback((d: SimDigest) => {
    setDigestState(d);
    setSceneHistory((h) => recordSizes(h, d));
  }, []);
  const [status, setStatus] = useState<SimStatus>("loading");
  const [error, setError] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [activeCase, setActiveCase] = useState<CaseSpec | null>(null);
  const activeCaseRef = useRef<CaseSpec | null>(null);
  const completedCases = useRef(new Set<string>());
  const presentation = useRef(new CasePresentation());
  const releasingCase = useRef(false);
  const [caseReports, setCaseReports] = useState<{ report: CaseReport; at: number }[]>([]);
  const [caseChanges, setCaseChanges] = useState<{ id: string; label: string; tick: number; status: string }[]>([]);
  const [speed, setSpeedState] = useState(DEFAULT_SPEED);

  const publishCase = useCallback((result: CaseReport) => {
    playingRef.current = false;
    clock.setPlaying(false, performance.now()); setPlaying(false);
    setCaseReports((items) => [...items, { report: result, at: Date.now() }].slice(-30));
    setCaseChanges((items) => items.map((entry) => entry.id === result.id ? { ...entry, status: result.reason === "settled" ? "Settled (model heuristic)" : result.reason === "limit" ? "Observation complete" : result.reason } : entry));
  }, [clock]);

  const accept = useCallback((f: Frame) => {
    const store = frames.current;
    store.previous = store.current;
    store.current = f;
    store.receivedAt = store.clock.now();
    setFrame(f);
    if (f.digest) setDigest(f.digest);
  }, [setDigest]);

  useEffect(() => {
    const client = SimClient.spawn();
    const presentationController = presentation.current;
    clientRef.current = client;
    const off = client.onFrame(accept);
    const offStopped = client.onStopped(({ error: reason }) => {
      playingRef.current = false;
      clock.setPlaying(false, performance.now());
      setPlaying(false);
      setError(reason);
    });
    let presentationFrame = 0;
    const drainPresentation = () => {
      const current = frames.current.current;
      const visual = frames.current.visualComplete;
      const result = presentation.current.take(clock.now(), !!current && visual?.epoch === current.epoch && visual.tick === current.tick);
      if (result) publishCase(result);
      else if (presentation.current.pending) presentationFrame = requestAnimationFrame(drainPresentation);
    };
    const offCase = client.onCaseComplete(({ report: result }) => {
      if (completedCases.current.has(result.id)) return;
      completedCases.current.add(result.id);
      const immediate = releasingCase.current ? result : presentation.current.begin(result, clock.now(), 1000 / speedRef.current);
      if (immediate) publishCase(immediate);
      else presentationFrame = requestAnimationFrame(drainPresentation);
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
      offCase();
      cancelAnimationFrame(presentationFrame); presentationController.cancel();
      client.terminate();
      clientRef.current = null;
      playingRef.current = false;
      clock.setPlaying(false, performance.now());
    };
  }, [world, seed, config, accept, clock, setDigest, publishCase]);

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
    if (activeCaseRef.current && completedCases.current.has(activeCaseRef.current.id) && !presentation.current.pending) return;
    playingRef.current = true;
    clock.setPlaying(true, performance.now());
    setPlaying(true);
    if (presentation.current.pending) return;
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
      presentation.current.rescale(clock.now(), speedRef.current / ticksPerSecond);
      speedRef.current = ticksPerSecond;
      setSpeedState(ticksPerSecond);
      if (playingRef.current && !presentation.current.pending) clientRef.current?.play(MAIN_TIMELINE, ticksPerSecond).catch(report);
    },
    [report, clock],
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
          const failed = result.results.find((r) => !r.ok);
          if (failed && !failed.ok) { report(failed.error); return false; }
        }
        return true;
      } catch (e) {
        report(e);
        return false;
      }
    },
    [refresh, report, setDigest],
  );

  const rewind = useCallback(
    async (tick: number) => {
      const client = clientRef.current;
      if (!client) return false;
      try {
        releasingCase.current = true;
        presentation.current.cancel();
        const interruptedId = activeCaseRef.current?.id;
        if (interruptedId) setCaseChanges((items) => items.map((entry) => entry.id === interruptedId ? { ...entry, status: "Interrupted by rewind" } : entry));
        playingRef.current = false;
        clock.setPlaying(false, performance.now()); setPlaying(false);
        await client.pause();
        const result = await client.rewind(MAIN_TIMELINE, tick);
        presentation.current.cancel();
        activeCaseRef.current = null; setActiveCase(null);
        setDigest(result.digest);
        await refresh();
        return true;
      } catch (e) {
        report(e);
        return false;
      } finally {
        releasingCase.current = false;
      }
    },
    [refresh, report, setDigest, clock],
  );

  const startCase = useCallback(async (spec: CaseSpec, label: string) => {
    const client = clientRef.current;
    if (!client) throw new Error("The city is still loading.");
    presentation.current.cancel();
    activeCaseRef.current = spec; setActiveCase(spec);
    setCaseChanges((items) => [...items, { id: spec.id, label, tick: spec.startTick, status: "Applied · ready to play" }].slice(-30));
    playingRef.current = false; clock.setPlaying(false, performance.now()); setPlaying(false);
    try { await client.startCase(MAIN_TIMELINE, spec, speedRef.current, false); }
    catch (error) {
      activeCaseRef.current = null; setActiveCase(null);
      playingRef.current = false; clock.setPlaying(false, performance.now()); setPlaying(false);
      setError(`The change was applied, but case playback could not start: ${message(error)}`);
      setCaseChanges((items) => items.map((entry) => entry.id === spec.id ? { ...entry, status: "Playback failed; change applied" } : entry));
    }
  }, [clock]);

  const finishCase = useCallback(async () => {
    const client = clientRef.current;
    if (!client) return;
    releasingCase.current = true;
    try {
      const pending = presentation.current.flush();
      if (pending) publishCase(pending);
      await client.finishCase(MAIN_TIMELINE);
      presentation.current.cancel();
      await client.pause();
      activeCaseRef.current = null; setActiveCase(null);
      playingRef.current = false; clock.setPlaying(false, performance.now()); setPlaying(false);
    } finally { releasingCase.current = false; }
  }, [clock, publishCase]);

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

  const book = useCallback((venue: number, acts: { entity: number; profile?: { entity: number; weight: number }[] }[], weeks: number, date: { startTick?: number; durationDays?: number } = {}) => {
    const client = clientRef.current;
    return client ? client.book(MAIN_TIMELINE, venue, acts, weeks, date) : Promise.reject(new Error("the simulation isn't running"));
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
  }, [setDigest]);

  const dismissError = useCallback(() => setError(null), []);

  return {
    activeCase, caseReports, caseChanges, startCase, finishCase,
    status, error, playing, speed, frame, digest, frames, sceneHistory, play, pause, setSpeed, act, rewind, demand, scout, whatIf, book, resident, latestDigest, dismissError,
  };
}
