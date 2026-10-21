"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import type { BookingDate, BookingResult } from "@/sim/booking";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";
import { ArtistPicker } from "@/ui/ArtistPicker";
import type { BookingAct } from "@/ui/BookingPanel";
import { rankArtistVenues, type VenueFit } from "@/ui/event-planning";
import { fetchOutsideAct } from "@/ui/outside-act-client";
import { dayLabel, plural } from "@/ui/words";

type Brief = { act: BookingAct; date: BookingDate; snapshot: string; fits: VenueFit[] };
type Outcome = { venue: VenueFit; result: BookingResult };
const snapshot = (f: Frame | null) => f ? `${f.epoch}:${f.tick}` : "";
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const rounded = (n: number | undefined) => n === undefined ? "—" : Math.round(n).toLocaleString();

/** Artist-first decision flow. All comparisons run in the worker; no LLM is needed. */
export function EventPlanner({ world, city, frame, compare, schedule, onPreview, onCalendar, sceneTitle }: {
  sceneTitle: (id: number) => string;
  world: World;
  city: string;
  frame: Frame | null;
  compare: (slot: number, act: BookingAct, date: BookingDate) => Promise<BookingResult>;
  schedule: (slot: number, act: BookingAct, date: BookingDate, snapshot: string) => Promise<boolean>;
  onPreview: (slot: number) => void;
  onCalendar: () => void;
}) {
  const artists = useMemo(() => world.entities.flatMap((e, i) => e.type === "artist" ? [{ i, name: e.name }] : []), [world]);
  const [query, setQuery] = useState("");
  const [startTick, setStartTick] = useState(() => {
    const tick = frame?.tick ?? 0;
    return frame?.ticksPerWeek === 7 ? tick + ((4 - tick % 7 + 7) % 7) : tick;
  });
  const [nights, setNights] = useState(1);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [outcomes, setOutcomes] = useState<Outcome[] | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scheduled, setScheduled] = useState<string | null>(null);
  const request = useRef(0);
  useEffect(() => () => { request.current++; }, []);
  const tpw = frame?.ticksPerWeek ?? 7;
  const stale = brief !== null && brief.snapshot !== snapshot(frame);
  const chosen = outcomes?.find((r) => r.venue.slot === selected);
  const edit = () => { request.current++; setBrief(null); setOutcomes(null); setSelected(null); setScheduled(null); setError(null); setBusy(false); };

  const find = async (e: FormEvent) => {
    e.preventDefault();
    if (!frame || busy || !query.trim()) return;
    if (!Number.isInteger(startTick) || startTick < frame.tick || startTick > frame.tick + 52 * tpw || !Number.isInteger(nights) || nights < 1 || nights > 28) return setError("Choose a future simulation date and 1–28 nights.");
    const generation = ++request.current;
    setBusy(true); setError(null);
    try {
      const local = artists.find((a) => a.name.toLowerCase() === query.trim().toLowerCase());
      let act: BookingAct;
      if (local) act = { key: `in:${local.i}`, label: local.name, entity: local.i };
      else {
        const r = await fetchOutsideAct(city, query.trim(), world);
        if ("error" in r) throw new Error(r.error);
        act = r.inCity !== null ? { key: `in:${r.inCity}`, label: world.entities[r.inCity].name, entity: r.inCity }
          : { key: `out:${r.artist.name}`, label: r.artist.name, entity: r.proxy, profile: r.profile, note: "Venue fit uses Qloo's profile of this artist's fans." };
      }
      if (generation !== request.current) return;
      const fits = rankArtistVenues(world, frame, act);
      setBrief({ act, date: { startTick, ...(tpw === 7 ? { durationDays: nights } : {}) }, snapshot: snapshot(frame), fits });
    } catch (e) { if (generation === request.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (generation === request.current) setBusy(false); }
  };

  const run = async () => {
    if (!brief || stale || busy) return;
    const generation = ++request.current;
    setBusy(true); setError(null); setOutcomes(null);
    try {
      const results: Outcome[] = [];
      for (const venue of brief.fits) {
        const result = await compare(venue.slot, brief.act, brief.date);
        if (generation !== request.current) return;
        results.push({ venue, result });
      }
      results.sort((a, b) => b.result.turnout - a.result.turnout || b.venue.affinity - a.venue.affinity);
      setOutcomes(results); setSelected(results[0]?.venue.slot ?? null);
      if (results[0]) onPreview(results[0].venue.slot);
    } catch (e) { if (generation === request.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (generation === request.current) setBusy(false); }
  };

  const commit = async () => {
    if (!brief || !chosen || stale || busy) return;
    const generation = ++request.current;
    setBusy(true); setError(null);
    try {
      if (!await schedule(chosen.venue.slot, brief.act, brief.date, brief.snapshot)) throw new Error("The event could not be scheduled. Refresh the comparison and try again.");
      if (generation === request.current) setScheduled(`${brief.act.label} at ${chosen.venue.name}`);
    } catch (e) { if (generation === request.current) setError(e instanceof Error ? e.message : String(e)); }
    finally { if (generation === request.current) setBusy(false); }
  };

  return <section aria-label="Event planning" className="space-y-4 text-sm">
    <ol aria-label="Planning steps" className="flex gap-2 text-[11px] text-zinc-500">
      {["Artist & date", "Venue fit", "Event impact"].map((label, i) => <li key={label} aria-current={i === (outcomes ? 2 : brief ? 1 : 0) ? "step" : undefined} className={i === (outcomes ? 2 : brief ? 1 : 0) ? "text-violet-200" : ""}>{i + 1}. {label}</li>)}
    </ol>
    {scheduled ? <div className="space-y-3 rounded-lg border border-emerald-400/25 bg-emerald-400/5 p-4">
      <h3 className="font-medium text-emerald-200">Scheduled in the simulation</h3><p>{scheduled}</p>
      <p className="text-xs text-zinc-400">The event is now on the city calendar. This does not reserve the real venue.</p>
      <button type="button" onClick={onCalendar} className="w-full rounded-lg bg-white/10 px-3 py-2">View event calendar</button>
      <button type="button" onClick={edit} className="text-xs text-violet-200">Plan another event</button>
    </div> : !brief ? <form onSubmit={(e) => void find(e)} className="space-y-4">
      <p className="text-zinc-300">Who are you putting on? Find venues whose crowds match the artist, then compare the event against the same nights without it.</p>
      <label className="block space-y-2"><span className="text-xs text-zinc-400">Headliner</span>
        <ArtistPicker value={query} onChange={setQuery} artists={artists} disabled={busy || !frame} placeholder="Choose or search for an artist" outsideHint="No city match. Find matching venues will look this artist up in Qloo." />
      </label>
      <fieldset disabled={busy} className="space-y-3">
        <legend className="mb-2 text-xs text-zinc-400">Simulation date</legend>
        <label className="flex items-center justify-between text-xs">Start week<input aria-label="Event start week" type="number" min={Math.floor((frame?.tick ?? 0) / tpw)} max={Math.floor((frame?.tick ?? 0) / tpw) + 52} value={Math.floor(startTick / tpw)} onChange={(e) => setStartTick(Number(e.target.value) * tpw + startTick % tpw)} className="w-20 rounded-md bg-white/10 px-2 py-2" /></label>
        {tpw === 7 && <><div role="group" aria-label="Event weekday" className="flex gap-1">{DAYS.map((day, i) => <button type="button" key={day} aria-pressed={startTick % 7 === i} onClick={() => setStartTick(Math.floor(startTick / 7) * 7 + i)} className={`flex-1 rounded py-2 text-[10px] ${startTick % 7 === i ? "bg-violet-500/25 text-violet-100" : "bg-white/5 text-zinc-400 hover:bg-white/10"}`}>{day}</button>)}</div>
          <label className="flex items-center justify-between text-xs">Number of nights<input aria-label="Event duration nights" type="number" min={1} max={28} value={nights} onChange={(e) => setNights(Number(e.target.value))} className="w-20 rounded-md bg-white/10 px-2 py-2" /></label></>}
      </fieldset>
      <button type="submit" disabled={busy || !frame || !query.trim()} className="w-full rounded-lg bg-violet-500/80 px-3 py-2.5 font-medium text-white disabled:opacity-40">{busy ? "Finding artist…" : "Find matching venues"}</button>
      <p className="text-[11px] text-zinc-500">Dates and attendance belong to this model. Real availability and ticket sales are not known.</p>
    </form> : <>
      <div className="space-y-1"><h3 className="text-base font-medium">{brief.act.label}</h3><p className="text-xs text-zinc-400">{dayLabel(brief.date.startTick ?? 0, tpw)} · {tpw === 7 ? plural(brief.date.durationDays ?? 1, "night") : "1 week"}</p>
        <button type="button" disabled={busy} onClick={edit} className="py-1 text-xs text-violet-200 disabled:opacity-40">← Change artist or date</button></div>
      {stale && <p role="alert" className="text-xs text-amber-200">The city changed. Change the artist or date to refresh this plan before comparing or scheduling.</p>}
      {!outcomes ? <>
        <p className="text-xs text-zinc-400">Open music venues, clubs, bars and performance spaces with artist-affinity evidence in Qloo. Taste fit does not establish real suitability or availability. Compare the event to estimate turnout.</p>
        {brief.act.note && <p className="text-xs text-violet-200">{brief.act.note}</p>}
        <ul className="space-y-2">{brief.fits.map((v) => <li key={v.slot}><button type="button" onClick={() => onPreview(v.slot)} className="w-full rounded-lg border border-white/10 bg-white/5 p-3 text-left hover:bg-white/10"><span className="block font-medium">{v.name}</span><span className="text-xs text-zinc-400">{v.kind} · Qloo taste match · Show on map ↗</span></button></li>)}</ul>
        {brief.fits.length ? <button type="button" disabled={busy || stale} onClick={() => void run()} className="w-full rounded-lg bg-violet-500/80 px-3 py-2.5 font-medium text-white disabled:opacity-40">{busy ? "Comparing paired futures…" : `Compare impact at ${brief.fits.length} venues`}</button> : <p className="text-zinc-400">No open venues have enough affinity evidence for this artist in this city. Try another artist; no venue match has been invented.</p>}
      </> : <>
        <p className="text-xs text-zinc-400">Same artist, date and duration. Each venue is simulated with and without this event, across three paired seeds. The live city is unchanged.</p>
        <div role="group" aria-label="Compare event venues" className="space-y-2">{outcomes.map(({ venue, result }) => <button key={venue.slot} type="button" aria-pressed={selected === venue.slot} onClick={() => { setSelected(venue.slot); onPreview(venue.slot); }} className={`flex w-full items-start justify-between gap-2 rounded-lg border p-3 text-left ${selected === venue.slot ? "border-violet-400/50 bg-violet-500/15" : "border-white/10 bg-white/5"}`}><span className="min-w-0"><span className="block font-medium">{venue.name}</span><span className="text-xs text-zinc-400">{venue.kind}</span></span><span className="shrink-0 text-right"><span className="block font-mono">{rounded(result.turnout)}</span><span className="text-[10px] text-zinc-400">event visits</span></span></button>)}</div>
        {chosen && <div aria-label="Isolated event impact" className="space-y-3 rounded-lg border border-violet-400/20 bg-black/20 p-3">
          <h4 className="font-medium">Impact at {chosen.venue.name}</h4>
          <table className="w-full text-xs"><thead><tr className="text-zinc-400"><th scope="col" className="pb-2 text-left">Visits</th><th scope="col" className="pb-2 text-right">No event</th><th scope="col" className="pb-2 text-right">With event</th></tr></thead><tbody>
            <tr><th scope="row" className="py-1 text-left font-normal">This event</th><td className="text-right">0</td><td className="text-right">{rounded(chosen.result.turnout)}</td></tr>
            <tr><th scope="row" className="py-1 text-left font-normal">Usual venue visits</th><td className="text-right">{rounded(chosen.result.hostBaseline)}</td><td className="text-right">{rounded(chosen.result.hostBaseline === undefined ? undefined : chosen.result.hostBaseline + chosen.result.hostChange)}</td></tr>
            <tr className="border-t border-white/10"><th scope="row" className="pt-2 text-left">Venue + event</th><td className="pt-2 text-right">{rounded(chosen.result.hostBaseline)}</td><td className="pt-2 text-right font-medium text-violet-200">{rounded(chosen.result.hostWithEvent)}</td></tr>
          </tbody></table>
          {chosen.result.turnoutRange && <p className="text-xs text-zinc-400">Event turnout ranged from {rounded(chosen.result.turnoutRange.min)} to {rounded(chosen.result.turnoutRange.max)} visits across three runs. Visits are not unique people or ticket sales.</p>}
          <details className="text-xs text-zinc-400"><summary className="cursor-pointer">Crowds and nearby effects</summary><p className="mt-2">{chosen.result.scenes.length ? "Attending crowds: " + chosen.result.scenes.map(sceneTitle).join(", ") : "No scene attendance recorded."}</p><p className="mt-1">{rounded(chosen.result.neighbourLoss)} fewer visits at nearby venues versus the baseline.</p><p className="mt-1">The event uses a temporary venue slot at this location; capacity and behavior are model assumptions.</p></details>
          <button type="button" disabled={busy || stale} onClick={() => void commit()} className="w-full rounded-lg bg-violet-500/80 px-3 py-2.5 font-medium text-white disabled:opacity-40">{busy ? "Scheduling…" : "Schedule in the simulation"}</button>
        </div>}
      </>}
    </>}
    {error && <p role="alert" className="rounded-lg border border-rose-400/20 bg-rose-500/10 p-3 text-xs text-rose-200">{error}</p>}
  </section>;
}
