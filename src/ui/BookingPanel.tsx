"use client";

import { type FormEvent, useMemo, useState } from "react";
import type { BookingResult } from "@/sim/booking";
import type { BookingDate } from "@/sim/booking";
import { BOOKING_WEEKS, MAX_BOOKING_ACTS } from "@/sim/worker/protocol";
import { bookingVerdict, suggestActs } from "@/ui/booking-words";
import { plural } from "@/ui/words";
import { fetchOutsideAct } from "@/ui/outside-act-client";
import type { World } from "@/world/schema";

export type BookingAct = {
  key: string;
  label: string;
  entity: number;
  profile?: { entity: number; weight: number }[];
  /** For outside artists: who Qloo says their fans also like. */
  note?: string;
};

type Run = { results: BookingResult[]; acts: BookingAct[]; weeks: number; date: BookingDate } | null;

const signed = (x: number) => (Math.round(x) > 0 ? `+${Math.round(x)}` : `${Math.round(x)}`);

/**
 * Book for my venue: line up acts (suggested, in-city or outside via live Qloo), compare them at this
 * venue on forked futures, and book the best. The live city waits (paused) while you plan.
 */
export function BookingPanel({
  world,
  city,
  venueEntity,
  tick,
  ticksPerWeek,
  sceneTitle,
  compare,
  onBook,
  onClose,
}: {
  world: World;
  /** City slug, for outside-artist lookups. */
  city: string;
  venueEntity: number;
  tick: number;
  ticksPerWeek: number;
  sceneTitle: (id: number) => string;
  compare: (acts: BookingAct[], weeks: number, date: BookingDate) => Promise<BookingResult[]>;
  onBook: (act: BookingAct, weeks: number, date: BookingDate) => void;
  onClose: () => void;
}) {
  const venueName = world.entities[venueEntity]?.name ?? "your venue";
  const initial = useMemo(
    () => suggestActs(world, venueEntity).map((entity): BookingAct => ({ key: `in:${entity}`, label: world.entities[entity].name, entity })),
    [world, venueEntity],
  );
  const artists = useMemo(() => world.entities.flatMap((e, i) => (e.type === "artist" ? [{ i, name: e.name }] : [])), [world]);
  const [acts, setActs] = useState<BookingAct[]>(initial);
  const [weeks, setWeeks] = useState<number>(2);
  const [startTick, setStartTick] = useState(tick);
  const [durationDays, setDurationDays] = useState<number | undefined>(ticksPerWeek === 7 ? 1 : undefined);
  const [query, setQuery] = useState("");
  const [lookingUp, setLookingUp] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [run, setRun] = useState<Run>(null);
  const [loading, setLoading] = useState(false);

  const full = acts.length >= MAX_BOOKING_ACTS;
  const add = (act: BookingAct) => {
    setActs((a) => (a.some((x) => x.key === act.key) || a.length >= MAX_BOOKING_ACTS ? a : [...a, act]));
    setRun(null);
  };
  const remove = (key: string) => {
    setActs((a) => a.filter((x) => x.key !== key));
    setRun(null);
  };

  const addByName = async (e: FormEvent) => {
    e.preventDefault();
    const name = query.trim();
    if (!name || full) return;
    setMessage(null);
    const local = artists.find((a) => a.name.toLowerCase() === name.toLowerCase());
    if (local) {
      add({ key: `in:${local.i}`, label: local.name, entity: local.i });
      setQuery("");
      return;
    }
    setLookingUp(true);
    const r = await fetchOutsideAct(city, name, world);
    setLookingUp(false);
    if ("error" in r) return setMessage(r.error);
    if (r.inCity !== null) add({ key: `in:${r.inCity}`, label: world.entities[r.inCity].name, entity: r.inCity });
    else {
      const likes = [...r.similar.map((s) => s.name), ...r.tags.map((t) => t.name)].slice(0, 4).join(", ");
      add({ key: `out:${r.artist.name}`, label: r.artist.name, entity: r.proxy, profile: r.profile, note: `From Qloo: their fans also like ${likes}` });
    }
    setQuery("");
  };

  const runCompare = async () => {
    if (acts.length === 0) return;
    setLoading(true);
    setMessage(null);
    try {
      const date = { startTick, durationDays };
      setRun({ results: await compare(acts, weeks, date), acts, weeks, date });
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const ranked = run?.results.map((r) => ({ ...r, a: run.acts[r.act] })) ?? [];
  const verdict = run ? bookingVerdict(ranked.map((r) => ({ label: r.a.label, turnout: r.turnout, hostChange: r.hostChange, neighbourLoss: r.neighbourLoss })), venueName) : "";

  return (
    <aside aria-label="Plan a night" className="panel pointer-events-auto min-h-0 w-full space-y-3 overflow-y-auto p-4 text-sm">
      <fieldset disabled={loading} className="contents">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-400">Plan a night</p>
          <h2 className="text-lg font-medium leading-tight">{venueName}</h2>
        </div>
        <button type="button" onClick={onClose} aria-label="Close planning" className="rounded px-2 text-zinc-400 hover:bg-white/10">×</button>
      </div>
      <p className="text-xs text-zinc-400">
        Each act is simulated at this venue for the run, next to the same weeks without it, three times over. Add any artist; ones this city doesn&apos;t know are
        looked up live in Qloo.
      </p>

      <ul className="space-y-1.5">
        {acts.map((a) => (
          <li key={a.key} className="flex items-start justify-between gap-2 rounded-md bg-white/5 px-2 py-1.5">
            <span className="min-w-0">
              <span className="block truncate">{a.label}</span>
              {a.note && <span className="block text-xs text-violet-200/80">{a.note}</span>}
            </span>
            <button type="button" onClick={() => remove(a.key)} aria-label={`Remove ${a.label}`} className="shrink-0 rounded px-1.5 text-zinc-400 hover:bg-white/10">×</button>
          </li>
        ))}
        {acts.length === 0 && <li className="text-xs text-zinc-500">Add an act to compare.</li>}
      </ul>

      <form onSubmit={addByName} className="flex gap-2">
        <input
          list="booking-artists"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={full || lookingUp}
          placeholder={full ? `Up to ${MAX_BOOKING_ACTS} acts` : "Add an artist (any artist)"}
          aria-label="Add an artist"
          className="min-w-0 flex-1 rounded-md bg-white/5 px-2 py-1.5 outline-none ring-violet-400/50 focus:ring-1 disabled:opacity-50"
        />
        <datalist id="booking-artists">
          {artists.map((a) => (
            <option key={a.i} value={a.name} />
          ))}
        </datalist>
        <button type="submit" disabled={!query.trim() || full || lookingUp} className="rounded-md bg-white/10 px-3 disabled:opacity-40">
          {lookingUp ? "Asking Qloo…" : "Add"}
        </button>
      </form>

      <div className="flex items-center gap-2 text-xs" role="group" aria-label="Run length">
        <span className="text-zinc-400">Run for</span>
        {BOOKING_WEEKS.map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={weeks === w}
            onClick={() => {
              setWeeks(w);
              setDurationDays(undefined);
              setRun(null);
            }}
            className={`rounded-md px-2 py-1 ${weeks === w ? "bg-white/15" : "hover:bg-white/5"}`}
          >
            {w} {w === 1 ? "week" : "weeks"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-xs">
        <label>Start week <input aria-label="Start week" type="number" min={Math.floor(tick / ticksPerWeek)} max={Math.floor(tick / ticksPerWeek) + 52} value={Math.floor(startTick / ticksPerWeek)} onChange={(e) => { setStartTick(Number(e.target.value) * ticksPerWeek + startTick % ticksPerWeek); setRun(null); }} className="w-16 rounded bg-white/10 px-2 py-1" /></label>
        {ticksPerWeek === 7 && <>
          <label>Day <select aria-label="Start day" value={startTick % 7} onChange={(e) => { setStartTick(Math.floor(startTick / 7) * 7 + Number(e.target.value)); setRun(null); }} className="rounded bg-zinc-800 px-2 py-1">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d, i) => <option key={d} value={i}>{d}</option>)}</select></label>
          <label>Exact nights <input aria-label="Event nights" type="number" min={1} max={28} value={durationDays ?? weeks * 7} onChange={(e) => { setDurationDays(Number(e.target.value)); setRun(null); }} className="w-16 rounded bg-white/10 px-2 py-1" /></label>
        </>}
      </div>
      <p className="text-xs text-zinc-400">Dates use the simulation calendar. {durationDays !== undefined ? plural(durationDays, "night") : plural(weeks, "week")} starting in week {Math.floor(startTick / ticksPerWeek)}{ticksPerWeek === 7 ? ` · ${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][startTick % 7]}` : ""}. Past dates are rejected.</p>

      <button
        type="button"
        onClick={() => void runCompare()}
        disabled={acts.length === 0 || loading}
        className="w-full rounded-lg bg-violet-500/80 py-2 font-medium text-white hover:bg-violet-500 disabled:opacity-40"
      >
        {loading ? "Simulating…" : run ? "Compare again" : `Compare ${acts.length === 1 ? "this act" : `${acts.length} acts`}`}
      </button>

      {message && <p role="alert" className="rounded-lg border border-rose-400/30 bg-rose-950/60 px-3 py-2 text-xs text-rose-100">{message}</p>}

      {run && (
        <div className="space-y-2">
          <p className="text-zinc-200">{verdict}</p>
          {ranked.map((r, rank) => (
            <div key={r.a.key} className={`space-y-1 rounded-lg border p-2 ${rank === 0 ? "border-amber-300/40 bg-amber-300/5" : "border-white/10"}`}>
              <div className="flex items-baseline justify-between gap-2">
                <span className="truncate font-medium">{r.a.label}</span>
                {rank === 0 && <span className="text-[10px] uppercase tracking-widest text-amber-200">Best</span>}
              </div>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-xs">
                <dt className="text-zinc-400">Turnout</dt>
                <dd className="tabular-nums">{Math.round(r.turnout)} visits</dd>
                <dt className="text-zinc-400">Your usual nights</dt>
                <dd className={`tabular-nums ${Math.round(r.hostChange) > 0 ? "text-emerald-300" : Math.round(r.hostChange) < 0 ? "text-rose-300" : ""}`}>{signed(r.hostChange)} visits</dd>
                <dt className="text-zinc-400">New fans</dt>
                <dd className="tabular-nums">{r.a.profile ? "n/a" : Math.round(r.newFans)}</dd>
                <dt className="text-zinc-400">Neighbours lose</dt>
                <dd className="tabular-nums">{Math.round(r.neighbourLoss)} visits</dd>
              </dl>
              {r.scenes.length > 0 && <p className="truncate text-xs text-zinc-400">Draws {r.scenes.slice(0, 3).map(sceneTitle).join(", ")}</p>}
              <button type="button" onClick={() => onBook(r.a, run.weeks, run.date)} className="w-full rounded-md bg-white/10 py-1.5 text-xs hover:bg-white/15">
                Book {r.a.label} for {run.date.durationDays !== undefined ? plural(run.date.durationDays, "night") : plural(run.weeks, "week")}
              </button>
            </div>
          ))}
        </div>
      )}
      </fieldset>
    </aside>
  );
}
