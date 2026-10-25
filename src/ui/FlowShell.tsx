"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { FlyTo } from "@/render/CameraDirector";
import { CityCanvas } from "@/render/CityCanvas";
import { RACE_CSS, raceShortlistFocus } from "@/render/focus";
import type { CityLayout } from "@/render/layout";
import { BADGE_Y, type RacePin } from "@/render/RacePins";
import { type ClosureRules, venueViewsOf } from "@/render/venues";
import { DEFAULT_CONFIG } from "@/sim/config";
import type { Frame } from "@/sim/frame";
import { MAIN_TIMELINE } from "@/sim/worker/protocol";
import { CITIES } from "@/geo/cities";
import { Attribution } from "@/ui/Attribution";
import { DEMO_CONFIG, DEMO_SEED } from "@/ui/demo-config";
import { Intro, useIntro } from "@/ui/Intro";
import { useCityWorld } from "@/ui/useCityWorld";
import { useSimulation } from "@/ui/useSimulation";
import { LETTERS } from "@/ui/venue-race";
import { SceneLegend } from "@/ui/SceneLegend";
import { sceneLabel, VenueCard } from "@/ui/VenueCard";
import { VenueRace } from "@/ui/VenueRace";
import { areaName } from "@/ui/words";
import type { World } from "@/world/schema";

const CLOSURE_RULES: ClosureRules = {
  closeThreshold: DEMO_CONFIG.closeThreshold ?? DEFAULT_CONFIG.closeThreshold,
  graceTicks: DEMO_CONFIG.graceTicks ?? DEFAULT_CONFIG.graceTicks,
};
const AGENT_SLOTS = 2800;
/** Two simulated weeks before anything is shown, so every venue has regulars to highlight. */
const WARMUP_TICKS = 14;
/** Race nights per second: slow enough to follow people walking to each venue. */
const RACE_SPEED = 0.5;
const CITY_OPTIONS = Object.values(CITIES).map((c) => ({ slug: c.slug, name: c.name }));
const noop = () => {};

function City({ world, layout, attribution, citySlug, onCityChange }: {
  world: World;
  layout: CityLayout;
  attribution: string | null;
  citySlug: string;
  onCityChange: (slug: string) => void;
}) {
  const sim = useSimulation(world, DEMO_SEED, DEMO_CONFIG, WARMUP_TICKS, RACE_SPEED);
  const intro = useIntro();
  const flyRef = useRef<FlyTo | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [hosts, setHosts] = useState<number[] | null>(null);
  /** Venue under the pointer (with where the pointer is), and the venue opened by a click. */
  const [hoverVenue, setHoverVenue] = useState<number | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastPointer = useRef({ x: 0, y: 0 });
  const onVenueHover = useCallback((slot: number | null) => {
    setPointer(lastPointer.current);
    setHoverVenue(slot);
  }, []);
  const [openVenue, setOpenVenue] = useState<number | null>(null);
  /** The scenes list, and a scene highlighted by hovering or clicking a row. */
  const [scenesOpen, setScenesOpen] = useState(false);
  const [hoverScene, setHoverScene] = useState<number | null>(null);
  const [pinnedScene, setPinnedScene] = useState<number | null>(null);
  // The live city's latest frame: race frames never replace it, so the shortlist always reads the real city.
  const [liveFrame, setLiveFrame] = useState<Frame | null>(null);
  if (sim.frame?.timeline === MAIN_TIMELINE && sim.frame !== liveFrame) setLiveFrame(sim.frame);
  const raceFrame = sim.frame?.race ? sim.frame : null;

  const views = useMemo(() => (liveFrame ? venueViewsOf(liveFrame, layout, world) : []), [liveFrame, layout, world]);
  const raceFocus = useMemo(() => (hosts && liveFrame ? raceShortlistFocus(liveFrame, hosts) : null), [hosts, liveFrame]);
  // A scene picked in the scenes list takes over the map until it's let go.
  const sceneId = hoverScene ?? pinnedScene;
  const focus = useMemo(() => (sceneId !== null ? { kind: "scene" as const, id: sceneId } : raceFocus), [sceneId, raceFocus]);
  const shown = sim.frame ?? liveFrame;
  const areaOf = (slot: number) => {
    const v = views.find((x) => x.slot === slot);
    return v ? areaName(layout, v.position[0], v.position[1], world) : "";
  };
  const letterOf = (slot: number) => (hosts && hosts.includes(slot) ? LETTERS[hosts.indexOf(slot)] : undefined);
  const sceneNames = useMemo(() => new Map((sim.digest?.scenes ?? []).map((s) => [s.id, { id: s.id, name: sceneLabel(sim.digest, s.id, world) }])), [sim.digest, world]);

  const highlight = useCallback((next: number[] | null) => {
    setHosts(next);
    const spots = (next ?? []).flatMap((slot) => views.filter((v) => v.slot === slot).map((v) => v.position));
    if (!spots.length) return;
    // Frame the venues and their badges in the part of the screen the panel leaves free: right of it,
    // or above it on phones, where it docks at the bottom.
    const rect = panelRef.current?.getBoundingClientRect();
    const wide = window.innerWidth >= 640;
    const box = {
      left: wide && rect ? (2 * (rect.right + 12)) / window.innerWidth - 1 : -1,
      right: 1,
      bottom: !wide && rect ? 1 - (2 * rect.top) / window.innerHeight : -1,
      top: 1,
    };
    const points = spots.flatMap(([x, z]): [number, number, number][] => [[x, 0, z], [x, BADGE_Y, z]]);
    const x = spots.reduce((a, p) => a + p[0], 0) / spots.length;
    const z = spots.reduce((a, p) => a + p[1], 0) / spots.length;
    flyRef.current = { x, z, at: performance.now(), fit: { points, box } };
  }, [views]);

  const race = raceFrame?.race;
  const leader = race && race.night > 0 ? race.total.indexOf(Math.max(...race.total)) : -1;
  const pins = useMemo<RacePin[]>(() => (hosts ?? []).flatMap((slot, k) => {
    const view = views.find((v) => v.slot === slot);
    if (!view) return [];
    return [{ x: view.position[0], z: view.position[1], letter: LETTERS[k], colour: RACE_CSS[k], label: race && race.night > 0 ? race.total[k].toLocaleString() : undefined, leading: leader === k }];
  }), [hosts, views, race, leader]);

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#07080b] text-zinc-100" onPointerMove={(e) => {
      lastPointer.current = { x: e.clientX, y: e.clientY };
      if (hoverVenue !== null) setPointer(lastPointer.current);
    }}>
      <CityCanvas
        world={world}
        layout={layout}
        frames={sim.frames}
        frame={sim.frame}
        agentSlots={AGENT_SLOTS}
        tickMs={1000 / sim.speed}
        selectedVenue={openVenue}
        onVenueClick={setOpenVenue}
        onVenueHover={onVenueHover}
        onGroundClick={noop}
        cursor="default"
        ghost={null}
        focus={focus}
        flyTo={flyRef}
        onFrameChanges={noop}
        rules={CLOSURE_RULES}
        racePins={pins}
      />
      <div ref={panelRef} className="pointer-events-none absolute inset-x-2 bottom-2 top-auto flex max-h-[58dvh] flex-col gap-2 sm:inset-x-auto sm:bottom-auto sm:left-3 sm:top-3 sm:max-h-[calc(100dvh-1.5rem)] sm:w-[23rem]">
        <header className="panel pointer-events-auto flex items-center gap-3 px-4 py-2.5">
          <h1 className="min-w-0 flex-1 text-sm font-medium text-zinc-50">Genus Loci</h1>
          <select aria-label="City" value={citySlug} onChange={(e) => onCityChange(e.target.value)} className="rounded bg-zinc-900 px-2 py-1 text-xs text-zinc-100">
            {CITY_OPTIONS.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <button type="button" onClick={intro.show} aria-label="How this works" title="How this works" className="grid size-7 place-items-center rounded-full border border-white/15 text-sm text-zinc-300 hover:text-zinc-50">?</button>
        </header>
        {sim.status === "ready" && (
          <VenueRace
            world={world}
            city={citySlug}
            layout={layout}
            liveFrame={liveFrame}
            raceFrame={raceFrame}
            playing={sim.playing}
            speed={sim.speed}
            raceDone={sim.raceOutcomes !== null}
            onPlay={sim.play}
            onPause={sim.pause}
            onSpeed={sim.setSpeed}
            onHighlight={highlight}
            startRace={sim.startRace}
            venueFans={sim.venueFans}
            endRace={sim.endRace}
          />
        )}
      </div>
      {attribution && <Attribution qloo={world.meta?.source === "qloo"} />}
      <div className="pointer-events-none absolute right-3 top-3 hidden max-h-[calc(100dvh-5rem)] flex-col items-end gap-2 sm:flex">
        {world.meta?.source !== "qloo" && (
          <p className="panel max-w-64 px-3 py-2 text-xs text-amber-200">Synthetic stand-in city: no Qloo world is built for {world.city.name}, so these venues and tastes are made up.</p>
        )}
        {openVenue !== null && shown && <VenueCard world={world} frame={shown} digest={sim.digest} slot={openVenue} area={areaOf(openVenue)} rules={CLOSURE_RULES} raceLetter={letterOf(openVenue)} onClose={() => setOpenVenue(null)} />}
        {scenesOpen && (
          <div className="pointer-events-auto flex min-h-0 w-72 flex-col">
            <SceneLegend
              digest={sim.digest}
              frame={liveFrame}
              names={sceneNames}
              pinned={pinnedScene}
              focused={pinnedScene !== null}
              onHover={setHoverScene}
              onPin={(id) => setPinnedScene((p) => (p === id ? null : id))}
              onClear={() => { setPinnedScene(null); setHoverScene(null); }}
            />
          </div>
        )}
      </div>
      {sim.status === "ready" && (
        <button type="button" aria-expanded={scenesOpen} onClick={() => { setScenesOpen((o) => !o); setHoverScene(null); setPinnedScene(null); }}
          className="panel pointer-events-auto absolute bottom-8 right-3 hidden px-3 py-1.5 text-xs text-zinc-200 hover:bg-white/10 sm:block">
          {scenesOpen ? "Hide scenes" : "Taste scenes"}
        </button>
      )}
      {hoverVenue !== null && hoverVenue !== openVenue && shown && (
        <div className="pointer-events-none fixed z-20" style={{ left: pointer.x + 14, top: pointer.y + 14 }}>
          <VenueCard world={world} frame={shown} digest={sim.digest} slot={hoverVenue} area={areaOf(hoverVenue)} rules={CLOSURE_RULES} raceLetter={letterOf(hoverVenue)} compact />
        </div>
      )}
      <Intro city={world.city.name} open={intro.open} onClose={intro.close} />
      {sim.status === "loading" && <div className="pointer-events-none absolute inset-0 grid place-items-center text-zinc-400">Growing the city…</div>}
      {sim.error && (
        <div role="alert" className="pointer-events-auto absolute bottom-4 right-4 max-w-sm rounded-lg border border-rose-400/40 bg-rose-950/80 px-4 py-2 text-sm text-rose-100">
          {sim.error}
          <button type="button" onClick={sim.dismissError} className="ml-3 underline">Dismiss</button>
        </div>
      )}
    </div>
  );
}

/** The app: one city at a time, keyed so switching city starts a fresh simulation and camera. */
export default function FlowShell() {
  const [slug, setSlug] = useState<string>(CITIES.london.slug);
  const city = useCityWorld(slug);
  if (!city || city.slug !== slug) return <div className="grid h-dvh place-items-center bg-[#07080b] text-zinc-400">Mapping the streets…</div>;
  return <City key={city.slug} world={city.world} layout={city.layout} attribution={city.attribution} citySlug={city.slug} onCityChange={setSlug} />;
}
