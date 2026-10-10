"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { homeScene, sceneAnchor } from "@/render/anchors";
import type { FlyTo } from "@/render/CameraDirector";
import { CityCanvas } from "@/render/CityCanvas";
import type { FrameChange } from "@/render/effects/diff";
import type { Origin } from "@/render/effects/director";
import type { Focus } from "@/render/focus";
import type { GhostSpec } from "@/render/Ghost";
import { type CityLayout, nearestCell, type XZ } from "@/render/layout";
import { chooseVenueEntity } from "@/render/placement";
import { venueViewsOf } from "@/render/venues";
import type { SimConfig } from "@/sim/config";
import type { Frame } from "@/sim/frame";
import { Hud } from "@/ui/Hud";
import { SceneLegend } from "@/ui/SceneLegend";
import { TimelineBar } from "@/ui/TimelineBar";
import { type Toast, Toasts } from "@/ui/Toasts";
import { isPlacing, type Tool, Toolbar } from "@/ui/Toolbar";
import { useSimulation } from "@/ui/useSimulation";
import { VenuePanel } from "@/ui/VenuePanel";
import type { World } from "@/world/schema";
import { Attribution } from "@/ui/Attribution";
import { useCityWorld } from "@/ui/useCityWorld";
import { CITIES } from "@/geo/cities";
import { areaName, kindWord } from "@/ui/words";

const DEMO_SEED = 7;
const DEMO_CONFIG: Partial<SimConfig> = { nAgents: 2500, agentReserve: 300 };
const AGENT_SLOTS = 2800;
const EVENT = { duration: 3, reachKm: 25, capacity: 3000 } as const;
const MAX_TOASTS = 4;
const TOAST_MS = 4000;
/** Big-moment toasts from the simulation come at most this often; extras collapse into the newest. */
const ANNOUNCE_GAP_MS = 1500;

type Notify = (message: string, anchor?: XZ) => void;

/** A stack of short-lived toasts, and `notify` to add one. */
function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(0);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const t of pending) clearTimeout(t);
      pending.clear();
    };
  }, []);
  const notify = useCallback<Notify>((message, anchor) => {
    const id = nextId.current++;
    setToasts((ts) => [...ts, { id, message, anchor }].slice(-MAX_TOASTS));
    const timer = setTimeout(() => {
      timers.current.delete(timer);
      setToasts((ts) => ts.filter((t) => t.id !== id));
    }, TOAST_MS);
    timers.current.add(timer);
  }, []);
  return { toasts, notify };
}

/** `notify`, throttled to one toast per ANNOUNCE_GAP_MS; while waiting, only the newest message is kept. */
function useAnnounce(notify: Notify): Notify {
  const lastAt = useRef(-Infinity);
  const pending = useRef<{ message: string; anchor?: XZ } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );
  return useCallback<Notify>(
    (message, anchor) => {
      const wait = lastAt.current + ANNOUNCE_GAP_MS - performance.now();
      if (wait <= 0 && !timer.current) {
        lastAt.current = performance.now();
        notify(message, anchor);
        return;
      }
      pending.current = { message, anchor };
      timer.current ??= setTimeout(() => {
        timer.current = null;
        const next = pending.current;
        pending.current = null;
        if (!next) return;
        lastAt.current = performance.now();
        notify(next.message, next.anchor);
      }, Math.max(0, wait));
    },
    [notify],
  );
}

const placementKey = (entity: number, cell: number) => `${entity}:${cell}`;

function Game({
  world, layout, attribution, citySlug, onCityChange,
}: {
  world: World;
  layout: CityLayout;
  attribution: string | null;
  citySlug: string;
  onCityChange: (slug: string) => void;
}) {
  const sim = useSimulation(world, DEMO_SEED, DEMO_CONFIG);
  const { act, frames } = sim;
  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [selected, setSelected] = useState<number | null>(null);
  /** Focus set by selecting a venue or clicking a legend row; `hovered` (a legend row) wins while set. */
  const [pinned, setPinned] = useState<Focus>(null);
  const [hovered, setHovered] = useState<number | null>(null);
  const { toasts, notify } = useToasts();
  const announce = useAnnounce(notify);
  const flyRef = useRef<FlyTo | null>(null);
  /** Placements the player made that the frame feed hasn't shown yet, so they aren't announced twice. */
  const placed = useRef(new Set<string>());
  /** Venues the player closed that the frame feed hasn't shown closing yet (same keys as `placed`). */
  const closedByPlayer = useRef(new Set<string>());

  const clearFocus = useCallback(() => {
    setPinned(null);
    setHovered(null);
    setSelected(null);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTool({ kind: "select" });
      clearFocus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clearFocus]);

  const flyTo = useCallback(([x, z]: XZ) => {
    flyRef.current = { x, z, at: performance.now() };
  }, []);

  // A pinned scene that has merged or died stops being a focus.
  const live = sim.digest?.scenes;
  const pinnedLive = pinned?.kind === "scene" && live && !live.some((s) => s.id === pinned.id) ? null : pinned;
  const focus = useMemo<Focus>(() => (hovered !== null ? { kind: "scene", id: hovered } : pinnedLive), [hovered, pinnedLive]);

  const onVenueClick = useCallback((slot: number) => {
    setSelected(slot);
    setPinned({ kind: "venue", slot });
  }, []);

  const onPinScene = useCallback(
    (id: number) => {
      if (pinnedLive?.kind === "scene" && pinnedLive.id === id) {
        setPinned(null);
        return;
      }
      setPinned({ kind: "scene", id });
      setSelected(null);
      const frame = frames.current.current;
      const anchor = frame ? sceneAnchor(frame, layout, id) : null;
      if (anchor) flyTo(anchor);
    },
    [flyTo, frames, layout, pinnedLive],
  );

  // Peeks only: onFrameChanges (which runs afterwards) is what clears the sets.
  const classifyChange = useCallback((c: FrameChange, frame: Frame): Origin => {
    if (c.kind !== "venueOpened" && c.kind !== "eventStarted" && c.kind !== "venueClosed") return "auto";
    if (c.slot >= frame.nVenues) return "auto";
    const key = placementKey(frame.venueEntity[c.slot], frame.venueCell[c.slot]);
    return (c.kind === "venueClosed" ? closedByPlayer : placed).current.has(key) ? "player" : "auto";
  }, []);

  const onFrameChanges = useCallback(
    (changes: FrameChange[], frame: Frame) => {
      const views = venueViewsOf(frame, layout, world);
      for (const c of changes) {
        if (c.kind === "venueOpened" || c.kind === "eventStarted" || c.kind === "venueClosed") {
          const view = views[c.slot];
          if (!view) continue;
          if (c.kind === "venueClosed") {
            closedByPlayer.current.delete(placementKey(view.entity, frame.venueCell[c.slot]));
            announce(`${view.name} closed`, view.position);
            continue;
          }
          // The player's own placements were confirmed when they were made.
          if (placed.current.delete(placementKey(view.entity, frame.venueCell[c.slot]))) continue;
          if (c.kind === "eventStarted") {
            announce(`${view.name} is playing tonight`, view.position);
          } else {
            const scene = homeScene(frame, frame.venueCell[c.slot]);
            announce(scene >= 0 ? `${view.name} opened (demand from Scene ${scene})` : `${view.name} opened`, view.position);
          }
        } else if (c.kind === "sceneBorn") {
          const anchor = sceneAnchor(frame, layout, c.scene) ?? undefined;
          announce(c.parent === null ? `A new scene formed: Scene ${c.scene}` : `Scene ${c.scene} split off from Scene ${c.parent}`, anchor);
        } else if (c.kind === "sceneEnded") {
          if (c.into === null) announce(`Scene ${c.scene} faded away`);
          else announce(`Scene ${c.scene} merged into Scene ${c.into}`, sceneAnchor(frame, layout, c.into) ?? undefined);
        }
      }
    },
    [announce, layout, world],
  );

  const onGroundClick = useCallback(
    (x: number, z: number) => {
      const cell = nearestCell(layout, x, z);
      const anchor: XZ = [x, z];
      if (tool.kind === "open" && tool.venueKind !== null) {
        const entity = chooseVenueEntity(world, tool.venueKind, cell);
        const key = placementKey(entity, cell);
        setTool({ kind: "select" });
        placed.current.add(key);
        void act({ type: "openVenue", entity, cell }).then((ok) => {
          if (ok) notify(`Opened a ${kindWord(world.entities[entity].kind ?? "other")} in ${areaName(layout, x, z)}`, anchor);
          else placed.current.delete(key);
        });
      } else if (tool.kind === "event" && tool.entity !== null) {
        const entity = tool.entity;
        const key = placementKey(entity, cell);
        setTool({ kind: "select" });
        placed.current.add(key);
        void act({ type: "scheduleEvent", entity, cell, ...EVENT }).then((ok) => {
          if (ok) notify(`${world.entities[entity].name} is playing tonight`, anchor);
          else placed.current.delete(key);
        });
      } else if (tool.kind === "select") {
        clearFocus();
      }
    },
    [act, clearFocus, layout, notify, tool, world],
  );

  const shownFrame = sim.frame;
  const onCloseVenue = useCallback(
    (venue: number) => {
      // The frame the venue panel is showing, which is what the player clicked "close" on.
      const frame = shownFrame;
      // Ending an event early shows as eventEnded (no closure toast), so only permanent venues are tracked.
      const key = frame && venue < frame.nVenues && frame.venueExpires[venue] < 0 ? placementKey(frame.venueEntity[venue], frame.venueCell[venue]) : null;
      if (key) closedByPlayer.current.add(key);
      void act({ type: "closeVenue", venue }).then((ok) => {
        if (!ok && key) closedByPlayer.current.delete(key);
      });
    },
    [act, shownFrame],
  );

  let ghost: GhostSpec | null = null;
  if (tool.kind === "open" && tool.venueKind !== null) ghost = { kind: "venue", venueKind: tool.venueKind };
  else if (tool.kind === "event" && tool.entity !== null) ghost = { kind: "event" };

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#07080b] text-zinc-100">
      <CityCanvas
        world={world}
        layout={layout}
        frames={frames}
        frame={sim.frame}
        agentSlots={AGENT_SLOTS}
        tickMs={1000 / sim.speed}
        selectedVenue={selected}
        onVenueClick={onVenueClick}
        onGroundClick={onGroundClick}
        cursor={isPlacing(tool) ? "crosshair" : "default"}
        ghost={ghost}
        focus={focus}
        flyTo={flyRef}
        onFrameChanges={onFrameChanges}
        classifyChange={classifyChange}
      />
      <Hud
        city={world.city.name}
        digest={sim.digest}
        tick={sim.frame?.tick ?? 0}
        cities={CITY_OPTIONS}
        citySlug={citySlug}
        onCityChange={onCityChange}
      />
      <Toolbar world={world} digest={sim.digest} tool={tool} onTool={setTool} />
      <div className="pointer-events-none absolute right-4 top-24 flex max-h-[calc(100dvh-12rem)] w-72 flex-col gap-3">
        <VenuePanel
          world={world}
          frame={sim.frame}
          slot={selected}
          onCloseVenue={onCloseVenue}
          onDismiss={clearFocus}
        />
        <SceneLegend
          digest={sim.digest}
          frame={sim.frame}
          pinned={pinnedLive?.kind === "scene" ? pinnedLive.id : null}
          focused={focus !== null}
          onHover={setHovered}
          onPin={onPinScene}
          onClear={clearFocus}
        />
      </div>
      <TimelineBar
        tick={sim.frame?.tick ?? 0}
        earliest={sim.frame?.earliestTick ?? 0}
        playing={sim.playing}
        speed={sim.speed}
        onPlay={sim.play}
        onPause={sim.pause}
        onSpeed={sim.setSpeed}
        onRewind={(t) => void sim.rewind(t)}
      />
      <Toasts toasts={toasts} onSelect={(t) => t.anchor && flyTo(t.anchor)} />
      {attribution && <Attribution />}
      {sim.status === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-zinc-400">Growing the city…</div>
      )}
      {sim.error && (
        <div role="alert" className="pointer-events-auto absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border border-rose-400/40 bg-rose-950/80 px-4 py-2 text-sm text-rose-100">
          {sim.error}
          <button type="button" onClick={sim.dismissError} className="ml-3 underline">Dismiss</button>
        </div>
      )}
    </div>
  );
}

const CITY_OPTIONS = Object.values(CITIES).map((c) => ({ slug: c.slug, name: c.name }));

export default function GameShell() {
  const [slug, setSlug] = useState<string>(CITIES.london.slug);
  const city = useCityWorld(slug);
  if (!city || city.slug !== slug) {
    return <div className="grid h-dvh place-items-center bg-[#07080b] text-zinc-400">Mapping the streets…</div>;
  }
  // Keyed by city so switching starts a fresh simulation, camera and effects.
  return (
    <Game
      key={city.slug}
      world={city.world}
      layout={city.layout}
      attribution={city.attribution}
      citySlug={city.slug}
      onCityChange={setSlug}
    />
  );
}
