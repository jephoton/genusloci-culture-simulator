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
import { VenueRace } from "@/ui/VenueRace";
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
  // The live city's latest frame: race frames never replace it, so the shortlist always reads the real city.
  const [liveFrame, setLiveFrame] = useState<Frame | null>(null);
  if (sim.frame?.timeline === MAIN_TIMELINE && sim.frame !== liveFrame) setLiveFrame(sim.frame);
  const raceFrame = sim.frame?.race ? sim.frame : null;

  const views = useMemo(() => (liveFrame ? venueViewsOf(liveFrame, layout, world) : []), [liveFrame, layout, world]);
  const focus = useMemo(() => (hosts && liveFrame ? raceShortlistFocus(liveFrame, hosts) : null), [hosts, liveFrame]);

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
    <div className="relative h-dvh w-full overflow-hidden bg-[#07080b] text-zinc-100">
      <CityCanvas
        world={world}
        layout={layout}
        frames={sim.frames}
        frame={sim.frame}
        agentSlots={AGENT_SLOTS}
        tickMs={1000 / sim.speed}
        selectedVenue={null}
        onVenueClick={noop}
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
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-medium text-zinc-50">Genus Loci</h1>
            <p className="truncate text-[11px] text-zinc-400">Which venue would draw the biggest crowd?</p>
          </div>
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
      {world.meta?.source !== "qloo" && (
        <p className="panel pointer-events-none absolute right-3 top-3 max-w-64 px-3 py-2 text-xs text-amber-200">Synthetic stand-in city: no Qloo world is built for {world.city.name}, so these venues and tastes are made up.</p>
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
