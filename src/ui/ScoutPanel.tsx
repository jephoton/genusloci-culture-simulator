import { useEffect, useMemo, useRef } from "react";
import { type Rgb, sceneHuesOf, sceneRgb } from "@/render/palette";
import type { Frame } from "@/sim/frame";
import type { ScoutResult } from "@/sim/scout";
import { scoutVerdict } from "@/ui/scout-words";

/** One scouted spot as the panel shows it. */
export type ScoutSpot = { cell: number; letter: string; own: boolean; area: string };

const MAX_SCENE_DOTS = 4;
const css = ([r, g, b]: Rgb) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;
const ordinal = (n: number) => ["1st", "2nd", "3rd", "4th"][n - 1] ?? `${n}th`;

function Metric({ label, value, unit, share, tone }: { label: string; value: number; unit: string; share: number; tone: "good" | "harm" }) {
  return (
    <div className="grid grid-cols-[6.5rem_1fr_auto] items-center gap-2 text-xs">
      <span className="text-zinc-400">{label}</span>
      <span aria-hidden className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <span
          className={`block h-full rounded-full transition-[width] duration-500 ${tone === "good" ? "bg-amber-300/80" : "bg-rose-400/80"}`}
          style={{ width: `${Math.round(Math.max(0, Math.min(1, share)) * 100)}%` }}
        />
      </span>
      <span className="tabular-nums text-zinc-200">
        {Math.round(value)}
        <span className="sr-only"> {unit}</span>
      </span>
    </div>
  );
}

/**
 * The scout's compare panel: one card per spot, best first, with turnout, new fans, the trade taken from
 * nearby venues and the scenes reached, a one-line verdict, and "Book it". Hovering or focusing a card
 * highlights its pin on the map.
 */
export function ScoutPanel({
  headliner, weeks, spots, results, loading, error, stale, frame, onHover, onBook, onCancel, onRetry, sceneTitle = (id) => `Scene ${id}`,
}: {
  /** A scene's display name (its field-guide name once named). */
  sceneTitle?: (id: number) => string;
  headliner: string;
  weeks: number;
  /** The spots being compared, in pin order (A, B, C, then the player's D). */
  spots: ScoutSpot[];
  /** Ranked results for the spots, or null before the first run finishes. */
  results: ScoutResult[] | null;
  loading: boolean;
  error: string | null;
  /** The city has moved on since these results (play or rewind), so they may be out of date. */
  stale: boolean;
  frame: Frame | null;
  onHover: (cell: number | null) => void;
  onBook: (cell: number) => void;
  onCancel: () => void;
  onRetry: () => void;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const hues = useMemo(() => (frame ? sceneHuesOf(frame.lineageParents) : new Float32Array(0)), [frame]);
  const byCell = useMemo(() => new Map(spots.map((s) => [s.cell, s])), [spots]);
  const rows = useMemo(
    () => (results ?? []).flatMap((r) => {
      const spot = byCell.get(r.cell);
      return spot ? [{ ...r, ...spot }] : [];
    }),
    [results, byCell],
  );
  const verdict = useMemo(() => scoutVerdict(rows), [rows]);
  const max = useMemo(
    () => ({
      turnout: Math.max(1, ...rows.map((r) => r.turnout)),
      newFans: Math.max(1, ...rows.map((r) => r.newFans)),
      loss: Math.max(1, ...rows.map((r) => r.neighbourLoss)),
    }),
    [rows],
  );

  // New results: move focus to the panel so keyboard and screen-reader users land on them.
  useEffect(() => {
    if (results) panelRef.current?.focus({ preventScroll: true });
  }, [results]);

  return (
    <aside
      ref={panelRef}
      tabIndex={-1}
      aria-label="Scout results"
      aria-busy={loading}
      className="panel pointer-events-auto flex min-h-0 w-full flex-col gap-3 overflow-y-auto p-3 outline-none focus-visible:ring-1 focus-visible:ring-amber-300/50"
      onMouseLeave={() => onHover(null)}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-widest text-amber-300/90">Scout a location</p>
          <h2 className="text-sm font-medium leading-snug">Where should {headliner} play?</h2>
        </div>
        <button type="button" onClick={onCancel} className="shrink-0 rounded px-2 py-0.5 text-xs text-zinc-300 hover:bg-white/10">
          Cancel
        </button>
      </div>
      <p className="text-xs text-zinc-400">
        The amber glow shows where people&apos;s taste fits {headliner}. Each spot is tested in its own simulated future, {weeks} weeks ahead,
        against a future with no event. Click the map to try a spot of your own.
      </p>

      {loading && (
        <p role="status" className="flex items-center gap-2 text-xs text-amber-200">
          <span aria-hidden className="size-2 animate-pulse rounded-full bg-amber-300" />
          Simulating {weeks} weeks at each spot…
        </p>
      )}
      {error && (
        <div role="alert" className="rounded-md border border-rose-400/40 bg-rose-950/60 px-2 py-1.5 text-xs text-rose-100">
          Couldn&apos;t scout: {error}
          <button type="button" onClick={onRetry} className="ml-2 underline">Try again</button>
        </div>
      )}
      {stale && !loading && (
        <p className="text-xs text-zinc-300">
          The city has moved on since this comparison.
          <button type="button" onClick={onRetry} className="ml-2 text-amber-200 underline">Re-run</button>
        </p>
      )}

      {verdict && !loading && <p className="rounded-md bg-amber-400/10 px-2 py-1.5 text-xs leading-relaxed text-amber-50">{verdict}</p>}

      {rows.length === 0 && !error && (
        <ul className="space-y-1">
          {spots.map((s) => (
            <li key={s.cell} className="flex items-center gap-2 rounded-md bg-white/5 px-2 py-1.5 text-xs text-zinc-300">
              <Letter letter={s.letter} own={s.own} />
              {s.area}
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <ol aria-label="Spots, best first" className={`space-y-2 transition-opacity ${loading ? "opacity-50" : ""}`}>
          {rows.map((r, rank) => {
            const shown = r.scenes.slice(0, MAX_SCENE_DOTS);
            const sceneLabel = r.scenes.length === 0 ? "no scenes yet" : `${r.scenes.length} ${r.scenes.length === 1 ? "scene" : "scenes"}`;
            return (
              <li
                key={r.cell}
                aria-label={`Spot ${r.letter}, ${r.area}, ranked ${ordinal(rank + 1)}: ${Math.round(r.turnout)} visits, ${r.newFans} new fans, ${Math.round(r.neighbourLoss)} visits taken from nearby venues, reaches ${sceneLabel}`}
                onMouseEnter={() => onHover(r.cell)}
                onFocus={() => onHover(r.cell)}
                className={`space-y-1.5 rounded-lg p-2 ring-1 transition hover:bg-white/10 focus-within:bg-white/10 ${
                  rank === 0 ? "bg-amber-400/[0.07] ring-amber-300/40" : "bg-white/5 ring-white/10"
                }`}
              >
                <div className="flex items-center gap-2">
                  <Letter letter={r.letter} own={r.own} />
                  <span className="min-w-0 flex-1 truncate text-sm text-zinc-100">
                    {r.area}
                    {r.own && <span className="ml-1 text-xs text-violet-300">(your spot)</span>}
                  </span>
                  {rank === 0 && <span className="rounded-full bg-amber-300/20 px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-amber-200">Best</span>}
                </div>
                <Metric label="Turnout" value={r.turnout} unit="visits" share={r.turnout / max.turnout} tone="good" />
                <Metric label="New fans" value={r.newFans} unit="people" share={r.newFans / max.newFans} tone="good" />
                <Metric label="Neighbours lose" value={r.neighbourLoss} unit="visits" share={r.neighbourLoss / max.loss} tone="harm" />
                <div className="flex items-center gap-2 text-xs">
                  <span className="w-[6.5rem] shrink-0 text-zinc-400">Scenes reached</span>
                  {r.scenes.length === 0 ? (
                    <span className="text-zinc-500">none yet</span>
                  ) : (
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
                      {shown.map((id) => (
                        <span key={id} className="flex items-center gap-1 text-zinc-300">
                          <span aria-hidden className="size-2 rounded-full" style={{ background: css(sceneRgb(hues, id)) }} />
                          {id < hues.length ? sceneTitle(id) : "New scene"}
                        </span>
                      ))}
                      {r.scenes.length > shown.length && <span className="text-zinc-500">+{r.scenes.length - shown.length}</span>}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => onBook(r.cell)}
                  disabled={loading}
                  aria-label={`Book it at spot ${r.letter}, ${r.area}`}
                  className={`mt-1 w-full rounded-md px-2 py-1 text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-50 ${
                    rank === 0 ? "bg-amber-400/90 text-amber-950 hover:bg-amber-300" : "bg-white/10 text-zinc-100 hover:bg-white/20"
                  }`}
                >
                  Book it
                </button>
              </li>
            );
          })}
        </ol>
      )}
    </aside>
  );
}

function Letter({ letter, own }: { letter: string; own: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
        own ? "bg-violet-400/25 text-violet-100 ring-1 ring-violet-300/60" : "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/60"
      }`}
    >
      {letter}
    </span>
  );
}
