"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import { RACE_CSS } from "@/render/focus";
import type { CityLayout } from "@/render/layout";
import { venueViewsOf } from "@/render/venues";
import type { EventOutcome } from "@/sim/events";
import type { Frame } from "@/sim/frame";
import type { RaceRequest } from "@/sim/worker/protocol";
import type { RaceContext } from "@/agents/race-helper";
import { ArtistPicker } from "@/ui/ArtistPicker";
import type { BookingAct } from "@/ui/BookingPanel";
import { rankArtistVenues, type VenueFit } from "@/ui/event-planning";
import { fetchOutsideAct } from "@/ui/outside-act-client";
import { RaceHelper } from "@/ui/RaceHelper";
import { LETTERS, NIGHT_OPTIONS, raceStartTick, summariseRace, WEEKDAYS } from "@/ui/venue-race";
import { areaName, plural } from "@/ui/words";
import type { World } from "@/world/schema";

type Phase = "artist" | "shortlist" | "race";
/** Shown when the race stops; set from the forecast so the summary matches the futures run. */
type Race = { runs: EventOutcome[][]; hosts: VenueFit[]; startTick: number; nights: number };

const SPEEDS = [{ value: 0.25, label: "Slow" }, { value: 0.5, label: "Normal" }, { value: 1, label: "Fast" }] as const;
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const n = (x: number) => Math.round(x).toLocaleString();

/**
 * The one flow: pick an artist, see three Qloo venues that fit (and their regulars) on the map, race
 * them night by night in parallel futures, read the result, then change the setup and race again.
 */
export function VenueRace({
  world, city, layout, liveFrame, raceFrame, playing, speed, raceDone, onPlay, onPause, onSpeed, onHighlight, startRace, endRace,
}: {
  world: World;
  city: string;
  layout: CityLayout;
  /** The live city (unchanged by races). */
  liveFrame: Frame | null;
  /** The latest race night while racing. */
  raceFrame: Frame | null;
  playing: boolean;
  speed: number;
  /** The played race reached its last night. */
  raceDone: boolean;
  onPlay(): void;
  onPause(): void;
  onSpeed(ticksPerSecond: number): void;
  /** The candidate venues to highlight (with their regulars), or null to clear. */
  onHighlight(hosts: number[] | null): void;
  startRace(race: RaceRequest): Promise<{ runs: EventOutcome[][] }>;
  endRace(): Promise<void>;
}) {
  const artists = useMemo(() => world.entities.flatMap((e, i) => (e.type === "artist" ? [{ i, name: e.name }] : [])), [world]);
  const [phase, setPhase] = useState<Phase>("artist");
  const [query, setQuery] = useState("");
  const [act, setAct] = useState<BookingAct | null>(null);
  const [fits, setFits] = useState<VenueFit[]>([]);
  const [hosts, setHosts] = useState<VenueFit[]>([]);
  const [weekday, setWeekday] = useState(4);
  const [nights, setNights] = useState<number>(3);
  const [race, setRace] = useState<Race | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef(0);

  // A few artists with three fitting venues, as one-click starting points (from the city as first shown).
  const [examples] = useState(() => {
    if (!liveFrame) return [];
    const ranked = artists.map((a) => ({ ...a, pop: world.entities[a.i].popularity })).sort((a, b) => b.pop - a.pop);
    const out: string[] = [];
    for (const a of ranked) {
      if (rankArtistVenues(world, liveFrame, { key: "", label: a.name, entity: a.i }).length === 3) out.push(a.name);
      if (out.length === 3) break;
    }
    return out;
  });

  const area = (slot: number) => {
    if (!liveFrame) return "";
    const view = venueViewsOf(liveFrame, layout, world).find((v) => v.slot === slot);
    return view ? areaName(layout, view.position[0], view.position[1], world) : "";
  };
  const regulars = (slot: number) => {
    if (!liveFrame?.attendanceHistory) return 0;
    let count = 0;
    const tpw = liveFrame.ticksPerWeek;
    for (let a = 0; a < liveFrame.alive.length; a++) {
      if (!liveFrame.alive[a]) continue;
      for (let k = 0; k < tpw; k++) if (liveFrame.attendanceHistory[a * tpw + k] === slot) { count++; break; }
    }
    return count;
  };

  const choose = (next: VenueFit[]) => {
    setHosts(next);
    onHighlight(next.map((h) => h.slot));
  };

  const findVenues = async (e?: FormEvent, name = query) => {
    e?.preventDefault();
    if (!liveFrame || busy || !name.trim()) return;
    const generation = ++request.current;
    setBusy(true);
    setError(null);
    try {
      const local = artists.find((a) => a.name.toLowerCase() === name.trim().toLowerCase());
      let next: BookingAct;
      if (local) next = { key: `in:${local.i}`, label: local.name, entity: local.i };
      else {
        const r = await fetchOutsideAct(city, name.trim(), world);
        if ("error" in r) throw new Error(r.error);
        next = r.inCity !== null
          ? { key: `in:${r.inCity}`, label: world.entities[r.inCity].name, entity: r.inCity }
          : { key: `out:${r.artist.name}`, label: r.artist.name, entity: r.proxy, profile: r.profile, note: `Not in this city's data: Qloo says their fans also like ${r.similar.slice(0, 3).map((s) => s.name).join(", ") || r.tags.slice(0, 3).map((t) => t.name).join(", ")}.` };
      }
      if (generation !== request.current) return;
      const ranked = rankArtistVenues(world, liveFrame, next, 8);
      if (ranked.length === 0) throw new Error(`Qloo links no music venue, club or bar in this city to ${next.label}. Try another artist.`);
      setAct(next);
      setFits(ranked);
      choose(ranked.slice(0, 3));
      setRace(null);
      setPhase("shortlist");
    } catch (err) {
      if (generation === request.current) setError(errorText(err));
    } finally {
      if (generation === request.current) setBusy(false);
    }
  };

  const run = async () => {
    if (!act || !liveFrame || busy || hosts.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      const startTick = raceStartTick(liveFrame.tick, weekday);
      const { runs } = await startRace({ entity: act.entity, profile: act.profile, hosts: hosts.map((h) => h.slot), startTick, nights });
      setRace({ runs, hosts, startTick, nights });
      setPhase("race");
      onPlay();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  const backToSetup = async () => {
    await endRace();
    setRace(null);
    setPhase("shortlist");
    onHighlight(hosts.map((h) => h.slot));
  };

  const newArtist = async () => {
    request.current++;
    if (phase === "race") await endRace();
    setRace(null);
    setAct(null);
    setHosts([]);
    setFits([]);
    setQuery("");
    setPhase("artist");
    onHighlight(null);
  };

  const live = raceFrame?.race;
  const summary = race && raceDone ? summariseRace(race.runs) : null;
  const leader = live ? live.total.indexOf(Math.max(...live.total)) : -1;
  const shown = race ? race.hosts : hosts;
  const helperContext: RaceContext = {
    step: phase === "artist" ? "artist" : phase === "shortlist" ? "venues" : summary ? "result" : "race",
    artist: act?.label,
    artistNote: act?.note,
    venues: phase === "artist" ? [] : shown.map((h, k) => ({ letter: LETTERS[k], name: h.name, kind: h.kind, area: area(h.slot), qlooFit: fits[0] ? Math.round((100 * h.affinity) / fits[0].affinity) : 0, regulars: regulars(h.slot) })),
    race: phase === "race" && race ? {
      firstNight: WEEKDAYS[race.startTick % 7],
      nights: race.nights,
      nightsPlayed: summary ? race.nights : live?.night ?? 0,
      visits: summary ? summary.rows.map((r) => r.watched) : live?.total ?? race.hosts.map(() => 0),
      result: summary ? {
        winner: summary.winner === null ? null : LETTERS[summary.winner],
        futures: summary.futures,
        consistent: summary.consistent,
        rows: summary.rows.map((r, k) => ({ letter: LETTERS[k], min: r.min, max: r.max, wins: r.wins, hostVisitsWithoutEvent: Math.round(r.usual), hostVisitsWithEvent: Math.round(r.withEvent), visitsLostByVenuesNearby: Math.round(r.neighbourLoss) })),
      } : undefined,
    } : undefined,
  };
  const maxTotal = Math.max(1, ...(live?.total ?? [0]), ...(race?.runs[0].map((r) => r.turnout) ?? [0]));

  return (
    <section aria-label="Find the best venue" className="panel pointer-events-auto flex max-h-full flex-col gap-3 overflow-y-auto p-4 text-sm">
      <ol aria-label="Steps" className="flex gap-1 text-[11px] uppercase tracking-wide">
        {(["1 Artist", "2 Venues", "3 Race"] as const).map((label, i) => (
          <li key={label} className={`flex-1 rounded px-2 py-1 text-center ${i === ["artist", "shortlist", "race"].indexOf(phase) ? "bg-violet-500/30 text-violet-100" : "text-zinc-500"}`}>{label}</li>
        ))}
      </ol>

      {phase === "artist" && (
        <form onSubmit={(e) => void findVenues(e)} className="space-y-3">
          <div>
            <h2 className="text-base font-medium text-zinc-50">Where should this artist play?</h2>
            <p className="text-xs text-zinc-400">Pick an artist. Qloo finds the three venues whose crowds fit them best, then the simulation races them.</p>
          </div>
          <div className="flex gap-2">
            <ArtistPicker value={query} onChange={setQuery} artists={artists} disabled={busy || !liveFrame} placeholder="Artist name" outsideHint="Not in this city's data: Find venues looks them up in Qloo." />
            <button type="submit" disabled={busy || !query.trim() || !liveFrame} className="rounded-lg bg-violet-500/80 px-3 py-1.5 text-white hover:bg-violet-500 disabled:opacity-40">{busy ? "Finding…" : "Find venues"}</button>
          </div>
          {examples.length > 0 && (
            <p className="flex flex-wrap items-center gap-1.5 text-xs text-zinc-400">
              Try
              {examples.map((name) => (
                <button key={name} type="button" disabled={busy} onClick={() => { setQuery(name); void findVenues(undefined, name); }} className="rounded-full border border-white/15 px-2 py-0.5 text-zinc-200 hover:bg-white/10">{name}</button>
              ))}
            </p>
          )}
        </form>
      )}

      {phase !== "artist" && act && (
        <header className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs text-zinc-400">Artist</p>
            <h2 className="truncate text-base font-medium text-zinc-50">{act.label}</h2>
            {act.note && <p className="text-xs text-zinc-400">{act.note}</p>}
          </div>
          <button type="button" onClick={() => void newArtist()} className="shrink-0 rounded px-2 py-1 text-xs text-violet-200 hover:bg-white/10">Change artist</button>
        </header>
      )}

      {phase === "shortlist" && (
        <>
          <p className="text-xs text-zinc-400">The best Qloo matches for {act?.label}. Each venue&apos;s regulars glow in its colour on the map.</p>
          <ul className="space-y-2">
            {hosts.map((h, k) => (
              <li key={h.slot} className="rounded-lg border bg-white/5 p-2.5" style={{ borderColor: `${RACE_CSS[k]}80` }}>
                <div className="flex items-center gap-2">
                  <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-zinc-950" style={{ background: RACE_CSS[k] }}>{LETTERS[k]}</span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{h.name}</p>
                    <p className="truncate text-xs text-zinc-400">{h.kind} · {area(h.slot)} · {plural(regulars(h.slot), "regular")} this week</p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-2 text-xs text-zinc-400">
                  <span className="w-14 shrink-0">Qloo fit</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-white/10"><span className="block h-full rounded" style={{ width: `${Math.round((100 * h.affinity) / fits[0].affinity)}%`, background: RACE_CSS[k] }} /></span>
                  {fits.length > hosts.length && (
                    <select aria-label={`Swap venue ${LETTERS[k]}`} value={h.slot} onChange={(e) => {
                      const pick = fits.find((f) => f.slot === Number(e.target.value));
                      if (pick) choose(hosts.map((x, j) => (j === k ? pick : x)));
                    }} className="max-w-24 rounded bg-zinc-900 px-1 py-0.5 text-zinc-200">
                      <option value={h.slot}>Swap…</option>
                      {fits.filter((f) => !hosts.some((x) => x.slot === f.slot)).map((f) => <option key={f.slot} value={f.slot}>{f.name}</option>)}
                    </select>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <label className="space-y-1 text-zinc-400">First night
              <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="block w-full rounded bg-zinc-900 px-2 py-1.5 text-zinc-100">
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
            <label className="space-y-1 text-zinc-400">Nights
              <select value={nights} onChange={(e) => setNights(Number(e.target.value))} className="block w-full rounded bg-zinc-900 px-2 py-1.5 text-zinc-100">
                {NIGHT_OPTIONS.map((x) => <option key={x} value={x}>{plural(x, "night")}</option>)}
              </select>
            </label>
          </div>
          <button type="button" onClick={() => void run()} disabled={busy || hosts.length === 0} className="rounded-lg bg-violet-500/80 py-2 font-medium text-white hover:bg-violet-500 disabled:opacity-40">
            {busy ? "Setting up…" : `Race ${hosts.length === 1 ? "it" : `these ${hosts.length}`}`}
          </button>
          <p className="text-[11px] text-zinc-500">Each venue hosts {act?.label} in its own copy of the same city, from the same moment and luck. Your live city doesn&apos;t change.</p>
        </>
      )}

      {phase === "race" && race && (
        <>
          <div className="flex items-baseline justify-between text-xs text-zinc-400">
            <span>{summary ? "Race over" : live && live.night > 0 ? `Night ${live.night} of ${live.nights} · ${WEEKDAYS[(race.startTick + live.night - 1) % 7]}` : `${plural(race.nights, "night")} from ${WEEKDAYS[race.startTick % 7]}`}</span>
            <span>Event visits</span>
          </div>
          {summary ? (
            <>
              <div role="status" className="space-y-1 rounded-lg border border-white/15 bg-white/5 p-3">
                <p className="font-medium text-zinc-50">
                  {summary.winner === null ? "Too close to call: the top venues tied in the race you watched." : `${LETTERS[summary.winner]} · ${race.hosts[summary.winner].name} drew the most.`}
                </p>
                <p className="text-xs text-zinc-400">
                  {summary.winner !== null && (summary.consistent ? `It also won in all ${summary.futures} futures with different luck, so the lead is clear in this model.` : `It won ${summary.rows[summary.winner].wins} of ${summary.futures} futures with different luck, so treat the lead as uncertain.`)}
                  {" "}These are simulated residents built from Qloo taste data, not ticket sales.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void run()} disabled={busy} className="rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/15">Watch again</button>
                <button type="button" onClick={() => void backToSetup()} className="rounded-lg bg-violet-500/80 px-3 py-1.5 text-white hover:bg-violet-500">Change the setup</button>
              </div>
            </>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={playing ? onPause : onPlay} className="rounded-lg bg-violet-500/80 px-4 py-1.5 text-white hover:bg-violet-500">{playing ? "Pause" : "Play"}</button>
              <div role="group" aria-label="Speed" className="flex overflow-hidden rounded-lg border border-white/10 text-xs">
                {SPEEDS.map((s) => <button key={s.value} type="button" aria-pressed={speed === s.value} onClick={() => onSpeed(s.value)} className={`px-2 py-1.5 ${speed === s.value ? "bg-white/15 text-zinc-50" : "text-zinc-400 hover:bg-white/10"}`}>{s.label}</button>)}
              </div>
              <button type="button" onClick={() => void backToSetup()} className="ml-auto rounded px-2 py-1 text-xs text-zinc-400 hover:bg-white/10">Stop</button>
            </div>
          )}
          <ul className="space-y-2">
            {race.hosts.map((h, k) => {
              const total = summary ? summary.rows[k].watched : live?.total[k] ?? 0;
              const win = summary ? summary.winner === k : !summary && live && live.night > 0 && leader === k;
              return (
                <li key={h.slot} className={`rounded-lg border p-2.5 ${win ? "bg-white/10" : "bg-white/5"}`} style={{ borderColor: `${RACE_CSS[k]}${win ? "ff" : "60"}` }}>
                  <div className="flex items-center gap-2">
                    <span className="grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold text-zinc-950" style={{ background: RACE_CSS[k] }}>{LETTERS[k]}</span>
                    <p className="min-w-0 flex-1 truncate font-medium">{h.name}</p>
                    <span className="tabular-nums text-base font-semibold" style={{ color: RACE_CSS[k] }}>{n(total)}</span>
                  </div>
                  <span className="mt-2 block h-2 overflow-hidden rounded bg-white/10"><span className="block h-full rounded transition-[width] duration-500" style={{ width: `${(100 * total) / maxTotal}%`, background: RACE_CSS[k] }} /></span>
                  {!summary && live && live.night > 0 && <p className="mt-1 text-[11px] text-zinc-400">{n(live.tonight[k])} tonight</p>}
                  {summary && (
                    <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-zinc-400">
                      <dt>Across {summary.futures} futures</dt><dd className="text-right text-zinc-200">{summary.rows[k].min === summary.rows[k].max ? n(summary.rows[k].min) : `${n(summary.rows[k].min)}–${n(summary.rows[k].max)}`} · won {summary.rows[k].wins}</dd>
                      <dt>Venue&apos;s usual nights</dt><dd className="text-right text-zinc-200">{n(summary.rows[k].usual)} → {n(summary.rows[k].withEvent)} with the event</dd>
                      <dt>Taken from venues nearby</dt><dd className="text-right text-zinc-200">{n(summary.rows[k].neighbourLoss)}</dd>
                    </dl>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-zinc-500">{summary ? "Glowing people went to an event, in its venue's colour." : "Bright: tonight's event visitors, walking to their venue. Faint: earlier nights' visitors. Everyone else is dimmed."}</p>
        </>
      )}

      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
      <RaceHelper city={city} context={helperContext} />
    </section>
  );
}
