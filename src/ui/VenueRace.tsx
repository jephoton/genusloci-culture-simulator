"use client";

import { type FormEvent, useMemo, useRef, useState } from "react";
import { RACE_CSS } from "@/render/focus";
import type { CityLayout } from "@/render/layout";
import { venueViewsOf } from "@/render/venues";
import type { EventOutcome } from "@/sim/events";
import type { Frame } from "@/sim/frame";
import type { RaceRequest } from "@/sim/worker/protocol";
import type { RaceContext } from "@/agents/race-helper";
import { type Candidate, MAX_CANDIDATES, readableTag } from "@/agents/venue-agent";
import { ArtistPicker } from "@/ui/ArtistPicker";
import type { BookingAct } from "@/ui/BookingPanel";
import { rankArtistVenues, type RaceVenue, rankRaceVenues, type VenueFit } from "@/ui/event-planning";
import { CITIES } from "@/geo/cities";
import { fetchOutsideAct } from "@/ui/outside-act-client";
import { agentExplain, agentFallbackNote, agentPick } from "@/ui/venue-agent-client";
import { LETTERS, NIGHT_OPTIONS, raceStartTick, summariseRace, WEEKDAYS } from "@/ui/venue-race";
import { areaName, plural } from "@/ui/words";
import type { World } from "@/world/schema";

type Phase = "artist" | "shortlist" | "race";
/** Shown when the race stops; set from the forecast so the summary matches the futures run. */
type Race = { runs: EventOutcome[][]; hosts: VenueFit[]; startTick: number; nights: number };
/** The scout agent's pick: a reason per venue slot, what it looked up, and a fallback note if it couldn't pick. */
type Scout = { working: true } | { working: false; reasons: Map<number, string>; liveFits: Map<number, number>; summary: string; steps: string[]; note?: string };

const SPEEDS = [{ value: 0.25, label: "Slow" }, { value: 0.5, label: "Normal" }, { value: 1, label: "Fast" }] as const;
/** Qloo affinity in the city's data as a percentage of the best venue's (0 where there's no link). */
const fitPercent = (v: VenueFit, all: readonly VenueFit[]) => {
  const top = Math.max(0, ...all.map((f) => f.affinity));
  return top > 0 ? Math.round((100 * v.affinity) / top) : 0;
};
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
const n = (x: number) => Math.round(x).toLocaleString();

/**
 * The one flow: pick an artist, see three Qloo venues that fit (and their regulars) on the map, race
 * them night by night in parallel futures, read the result, then change the setup and race again.
 */
export function VenueRace({
  world, city, layout, liveFrame, raceFrame, playing, speed, raceDone, onPlay, onPause, onSpeed, onHighlight, startRace, endRace, venueFans,
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
  /** Per venue slot: taste-weighted residents within an event's reach, from the live city. */
  venueFans(entity: number, profile?: { entity: number; weight: number }[]): Promise<number[]>;
}) {
  const artists = useMemo(() => world.entities.flatMap((e, i) => (e.type === "artist" ? [{ i, name: e.name }] : [])), [world]);
  const [phase, setPhase] = useState<Phase>("artist");
  const [query, setQuery] = useState("");
  const [act, setAct] = useState<BookingAct | null>(null);
  /** Every eligible venue for the current artist, best first. */
  const [fits, setFits] = useState<RaceVenue[]>([]);
  const [hosts, setHosts] = useState<VenueFit[]>([]);
  const [weekday, setWeekday] = useState(4);
  const [nights, setNights] = useState<number>(3);
  const [race, setRace] = useState<Race | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scout, setScout] = useState<Scout | null>(null);
  /** The agent's write-up of a race, fetched when the race starts (its result is already known). */
  const [explained, setExplained] = useState<{ race: Race; text: string | null; done: boolean } | null>(null);
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

  /** The card's Qloo figure: from the city's data, else from the agent's live Qloo lookup. */
  const fitLabel = (h: VenueFit) => {
    const stored = fitPercent(h, fits);
    const live = scout && !scout.working ? scout.liveFits.get(h.slot) : undefined;
    return stored > 0 ? `Qloo fit ${stored}` : live !== undefined ? `Qloo live fit ${live}` : "no stored Qloo link";
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
      const fans = await venueFans(next.entity, next.profile);
      if (generation !== request.current) return;
      const ranked = rankRaceVenues(world, liveFrame, next, fans, MAX_CANDIDATES);
      if (ranked.length === 0) throw new Error("This city has no open music venue, club or bar to race.");
      setAct(next);
      setFits(ranked);
      setHosts([]);
      onHighlight(null);
      setRace(null);
      setPhase("shortlist");
      setScout({ working: true });
      const candidates: Candidate[] = ranked.map((f, i) => ({
        id: `v${i}`, qid: world.entities[liveFrame.venueEntity[f.slot]].id, name: f.name, kind: f.kind, area: area(f.slot),
        qlooFit: fitPercent(f, ranked), fansNearby: f.fans, regulars: regulars(f.slot),
        tags: world.entities[liveFrame.venueEntity[f.slot]].tags.filter((t) => !t.includes(":category:")).slice(0, 8).map(readableTag),
      }));
      const artistTags = next.profile ? undefined : world.entities[next.entity].tags.slice(0, 20).map(readableTag);
      const spec = CITIES[city as keyof typeof CITIES] ?? { lat: world.city.lat, lon: world.city.lon, radiusM: 1500 };
      const r = await agentPick({ city: world.city.name, near: { lat: spec.lat, lon: spec.lon, radiusM: spec.radiusM * 1.5 }, artist: next.label, artistNote: next.note, artistTags, candidates });
      if (generation !== request.current) return;
      if ("error" in r) {
        const top = ranked.slice(0, 3);
        choose(top);
        const why = (f: RaceVenue) => (fitPercent(f, ranked) > 0 ? `Qloo fit ${fitPercent(f, ranked)} in the city's data.` : `About ${Math.round(f.fans)} fans nearby in the simulation.`);
        setScout({ working: false, reasons: new Map(top.map((f) => [f.slot, why(f)])), liveFits: new Map(), summary: "", steps: [], note: agentFallbackNote(r.error) });
      } else {
        const picked = r.picks.flatMap((p) => { const f = ranked[Number(p.id.slice(1))]; return f ? [{ f, reason: p.reason, liveFit: p.liveFit }] : []; });
        choose(picked.map((p) => p.f));
        setScout({ working: false, reasons: new Map(picked.map((p) => [p.f.slot, p.reason])), liveFits: new Map(picked.flatMap((p) => (p.liveFit === undefined ? [] : [[p.f.slot, p.liveFit] as [number, number]]))), summary: r.summary, steps: r.steps.map((x) => x.text) });
      }
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
      const next = { runs, hosts, startTick, nights };
      setRace(next);
      setExplained({ race: next, text: null, done: false });
      void agentExplain(world.city.name, resultContext(next)).then((text) => setExplained((e) => (e?.race === next ? { race: next, text, done: true } : e)));
      setPhase("race");
      onPlay();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  };

  /** What the agent needs to explain a race: the venues and the result of the futures run. */
  const resultContext = (r: Race): RaceContext => {
    const sum = summariseRace(r.runs);
    return {
      step: "result",
      artist: act?.label,
      artistNote: act?.note,
      venues: r.hosts.map((h, k) => ({ letter: LETTERS[k], name: h.name, kind: h.kind, area: area(h.slot), qlooFit: fitPercent(h, fits), regulars: regulars(h.slot) })),
      race: {
        firstNight: WEEKDAYS[r.startTick % 7],
        nights: r.nights,
        nightsPlayed: r.nights,
        visits: sum.rows.map((x) => x.watched),
        result: {
          winner: sum.winner === null ? null : LETTERS[sum.winner],
          futures: sum.futures,
          consistent: sum.consistent,
          rows: sum.rows.map((x, k) => ({ letter: LETTERS[k], min: x.min, max: x.max, wins: x.wins, hostVisitsWithoutEvent: Math.round(x.usual), hostVisitsWithEvent: Math.round(x.withEvent), visitsLostByVenuesNearby: Math.round(x.neighbourLoss) })),
        },
      },
    };
  };

  /** Show another step, leaving the race if one is playing; the artist and venues are kept. */
  const goTo = async (next: Phase) => {
    if (next === phase || busy) return;
    if (next === "race") return run();
    request.current++;
    if (phase === "race") await endRace();
    setPhase(next);
    onHighlight(next === "shortlist" ? hosts.map((h) => h.slot) : null);
  };

  const live = raceFrame?.race;
  const summary = race && raceDone ? summariseRace(race.runs) : null;
  const leader = live ? live.total.indexOf(Math.max(...live.total)) : -1;
  const stepNote: Record<Phase, string> = {
    artist: act?.label ?? "Pick one",
    shortlist: scout?.working ? "Agent picking…" : act ? hosts.map((h) => h.name).join(", ") : "Then three venues",
    race: phase === "race" && race ? (summary ? "Result" : live && live.night > 0 ? `Night ${live.night} of ${live.nights}` : "Starting") : act ? "Not run yet" : "Then the race",
  };
  const maxTotal = Math.max(1, ...(live?.total ?? [0]), ...(race?.runs[0].map((r) => r.turnout) ?? [0]));

  return (
    <section aria-label="Find the best venue" className="panel pointer-events-auto flex max-h-full flex-col gap-2.5 overflow-y-auto p-3 text-sm sm:overflow-visible">
      <nav aria-label="Steps" className="grid grid-cols-3 gap-1">
        {([["artist", "1", "Artist"], ["shortlist", "2", "Venues"], ["race", "3", "Race"]] as const).map(([step, num, label]) => {
          const enabled = step === "artist" || (act !== null && hosts.length > 0);
          const current = step === phase;
          return (
            <button key={step} type="button" aria-current={current ? "step" : undefined} disabled={!enabled || (busy && !current)} onClick={() => void goTo(step)}
              className={`min-w-0 rounded-lg border px-2 py-1 text-left transition ${current ? "border-violet-400/60 bg-violet-500/25" : "border-white/10 hover:bg-white/10 disabled:opacity-40 disabled:hover:bg-transparent"}`}>
              <span className={`block text-[11px] font-medium ${current ? "text-violet-100" : "text-zinc-300"}`}>{num}. {label}</span>
              <span className="block truncate text-[10px] text-zinc-400">{stepNote[step]}</span>
            </button>
          );
        })}
      </nav>

      {phase === "artist" && (
        <form onSubmit={(e) => void findVenues(e)} className="space-y-2">
          <p className="text-xs text-zinc-400">Pick an artist. Qloo finds the three venues whose crowds fit them best, then the simulation races them.</p>
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

      {phase === "shortlist" && (
        <>
          {act?.note && <p className="text-[11px] text-zinc-400">{act.note}</p>}
          <div aria-live="polite" className="rounded-lg border border-violet-400/25 bg-violet-500/10 px-2.5 py-1.5 text-[11px] text-zinc-300">
            {!scout || scout.working ? (
              <p><span className="font-medium text-violet-200">Scout agent</span> is checking {act?.label} in Qloo against {fits.length} venues in the city…</p>
            ) : scout.note ? (
              <p>{scout.note}</p>
            ) : (
              <details>
                <summary className="cursor-pointer"><span className="font-medium text-violet-200">Scout agent:</span> {scout.summary || `picked ${hosts.length} of ${fits.length} venues.`}</summary>
                <ol className="mt-1 list-decimal space-y-0.5 pl-4 text-zinc-400">
                  {scout.steps.map((t, i) => <li key={i}>{t}</li>)}
                  <li>Picked {hosts.length} of the city&apos;s {fits.length} venues</li>
                </ol>
              </details>
            )}
          </div>
          <ul className="space-y-1.5">
            {hosts.map((h, k) => (
              <li key={h.slot} className="rounded-lg border bg-white/5 px-2.5 py-1.5" style={{ borderColor: `${RACE_CSS[k]}80` }}>
                <div className="flex items-center gap-2">
                  <span className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-zinc-950" style={{ background: RACE_CSS[k] }}>{LETTERS[k]}</span>
                  <p className="min-w-0 flex-1 truncate font-medium">{h.name}</p>
                  {fits.length > hosts.length && hosts.length > 0 && (
                    <select aria-label={`Swap venue ${LETTERS[k]}`} value={h.slot} onChange={(e) => {
                      const pick = fits.find((f) => f.slot === Number(e.target.value));
                      if (pick) choose(hosts.map((x, j) => (j === k ? pick : x)));
                    }} className="max-w-20 shrink-0 rounded bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-200">
                      <option value={h.slot}>Swap…</option>
                      {fits.filter((f) => !hosts.some((x) => x.slot === f.slot)).slice(0, 12).map((f) => <option key={f.slot} value={f.slot}>{f.name}</option>)}
                    </select>
                  )}
                </div>
                <p className="truncate text-[11px] text-zinc-400">{h.kind} · {area(h.slot)} · {plural(regulars(h.slot), "regular")} · {fitLabel(h)}</p>
                {scout && !scout.working && <p className="text-[11px] leading-snug text-zinc-200">{scout.reasons.get(h.slot) ?? "Your pick."}</p>}
              </li>
            ))}
          </ul>
          <div className="flex items-end gap-2 text-xs">
            <label className="flex-1 text-zinc-400">First night
              <select value={weekday} onChange={(e) => setWeekday(Number(e.target.value))} className="mt-0.5 block w-full rounded bg-zinc-900 px-2 py-1 text-zinc-100">
                {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
              </select>
            </label>
            <label className="flex-1 text-zinc-400">Nights
              <select value={nights} onChange={(e) => setNights(Number(e.target.value))} className="mt-0.5 block w-full rounded bg-zinc-900 px-2 py-1 text-zinc-100">
                {NIGHT_OPTIONS.map((x) => <option key={x} value={x}>{plural(x, "night")}</option>)}
              </select>
            </label>
            <button type="button" onClick={() => void run()} disabled={busy || hosts.length === 0} className="flex-1 rounded-lg bg-violet-500/80 py-1.5 font-medium text-white hover:bg-violet-500 disabled:opacity-40">
              {busy ? "Setting up…" : "Start race"}
            </button>
          </div>
          <p className="text-[11px] text-zinc-500">Each venue hosts {act?.label} in its own copy of the same city, from the same moment and luck. Your live city doesn&apos;t change.</p>
        </>
      )}

      {phase === "race" && race && (
        <>
          {summary ? (
            <div role="status" className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-2">
              <div className="flex items-start gap-2">
                <p className="flex-1 font-medium text-zinc-50">
                  {summary.winner === null ? "Too close to call: the top venues tied." : `${LETTERS[summary.winner]} · ${race.hosts[summary.winner].name} drew the most.`}
                </p>
                <button type="button" onClick={() => void run()} disabled={busy} className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-xs hover:bg-white/15">Watch again</button>
              </div>
              <p className="text-[11px] text-zinc-400">
                {summary.winner !== null && (summary.consistent ? `It also won all ${summary.futures} futures with different luck, so the lead is clear in this model.` : `It won ${summary.rows[summary.winner].wins} of ${summary.futures} futures with different luck, so the lead is uncertain.`)}
                {" "}Simulated residents built from Qloo taste data, not ticket sales.
              </p>
              {explained?.race === race && (explained.text || !explained.done) && (
                <p aria-live="polite" className="mt-1.5 border-t border-white/10 pt-1.5 text-[11px] leading-snug text-zinc-200">
                  <span className="font-medium text-violet-200">Agent: </span>{explained.text ?? "writing up why…"}
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button type="button" onClick={playing ? onPause : onPlay} className="rounded-lg bg-violet-500/80 px-4 py-1 text-white hover:bg-violet-500">{playing ? "Pause" : "Play"}</button>
              <div role="group" aria-label="Speed" className="flex overflow-hidden rounded-lg border border-white/10 text-xs">
                {SPEEDS.map((s) => <button key={s.value} type="button" aria-pressed={speed === s.value} onClick={() => onSpeed(s.value)} className={`px-2 py-1 ${speed === s.value ? "bg-white/15 text-zinc-50" : "text-zinc-400 hover:bg-white/10"}`}>{s.label}</button>)}
              </div>
              <span className="ml-auto text-[11px] text-zinc-400">{live && live.night > 0 ? WEEKDAYS[(race.startTick + live.night - 1) % 7] : `From ${WEEKDAYS[race.startTick % 7]}`}</span>
            </div>
          )}
          <ul className="space-y-1.5">
            {race.hosts.map((h, k) => {
              const total = summary ? summary.rows[k].watched : live?.total[k] ?? 0;
              const win = summary ? summary.winner === k : !summary && live && live.night > 0 && leader === k;
              const row = summary?.rows[k];
              return (
                <li key={h.slot} className={`rounded-lg border px-2.5 py-1.5 ${win ? "bg-white/10" : "bg-white/5"}`} style={{ borderColor: `${RACE_CSS[k]}${win ? "ff" : "60"}` }}>
                  <div className="flex items-center gap-2">
                    <span className="grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold text-zinc-950" style={{ background: RACE_CSS[k] }}>{LETTERS[k]}</span>
                    <p className="min-w-0 flex-1 truncate font-medium">{h.name}</p>
                    {!summary && live && live.night > 0 && <span className="text-[11px] text-zinc-400">+{n(live.tonight[k])} tonight</span>}
                    <span className="tabular-nums text-base font-semibold" style={{ color: RACE_CSS[k] }}>{n(total)}</span>
                  </div>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded bg-white/10"><span className="block h-full rounded transition-[width] duration-500" style={{ width: `${(100 * total) / maxTotal}%`, background: RACE_CSS[k] }} /></span>
                  {row && summary && (
                    <p className="mt-1 text-[11px] leading-snug text-zinc-400">
                      {summary.futures} futures: <span className="text-zinc-200">{row.min === row.max ? n(row.min) : `${n(row.min)}–${n(row.max)}`}</span>, won <span className="text-zinc-200">{row.wins}</span> · venue <span className="text-zinc-200">{n(row.usual)} → {n(row.withEvent)}</span> · nearby <span className="text-zinc-200">−{n(row.neighbourLoss)}</span>
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-[11px] text-zinc-500">{summary ? "Venue: its visits on the same nights, without → with the event. Nearby: visits other venues lost." : "Bright: one dot per visit tonight, walking to each venue. Faint: earlier nights' visitors. Many residents would go wherever the artist plays, so one person can appear at more than one venue."}</p>
        </>
      )}

      {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
    </section>
  );
}
