"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "genusloci.intro.v1";

/** First-visit intro: what this is, how to read the map, and three things to try. Remembered per browser. */
export function Intro({ city, open, onClose }: { city: string; open: boolean; onClose: () => void }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="pointer-events-auto absolute inset-0 z-20 grid place-items-center bg-black/55 p-4" onClick={onClose}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="intro-title"
        onClick={(e) => e.stopPropagation()}
        className="panel max-h-full w-full max-w-lg space-y-4 overflow-y-auto p-5 text-sm text-zinc-200"
      >
        <header className="space-y-1">
          <h2 id="intro-title" className="text-lg font-medium text-zinc-50">Genus Loci</h2>
          <p className="text-zinc-300">
            A living model of {city}&apos;s culture, built from Qloo&apos;s taste data. Thousands of residents with real tastes go out to real venues, influence
            each other, and form scenes that grow, split and fade. Test a decision before you make it.
          </p>
        </header>
        <div className="space-y-1.5">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Reading the map</h3>
          <ul className="space-y-1">
            <li><span className="text-zinc-50">Dots</span> are residents, coloured by the scene they belong to. Each day they head out for the night and walk home.</li>
            <li><span className="text-zinc-50">Lit landmarks</span> are real venues from Qloo. The sign shows tonight&apos;s crowd; a red pulse means a venue is struggling.</li>
            <li><span className="text-zinc-50">Fidelity</span> checks the simulated city against Qloo heatmaps it was never fitted to.</li>
          </ul>
        </div>
        <div className="space-y-1.5">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">Try this</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li>Press <span className="text-zinc-50">Play</span> and watch scenes form in the legend on the right.</li>
            <li>Open <span className="text-zinc-50">Ask the co-pilot</span>: <em>&ldquo;What happens if the busiest club closes?&rdquo;</em></li>
            <li>Click <span className="text-zinc-50">Talk</span> on a scene to interview one of its residents.</li>
          </ol>
        </div>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} autoFocus className="rounded-md bg-violet-500/80 px-4 py-1.5 text-sm text-white hover:bg-violet-500">
            Explore {city}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Whether to show the intro: on the first visit only (falls back to showing it if storage is unavailable). */
export function useIntro(): { open: boolean; show: () => void; close: () => void } {
  // The game renders client-side only, so storage can be read while initialising.
  const [open, setOpen] = useState(() => {
    try {
      return window.localStorage.getItem(SEEN_KEY) !== "1";
    } catch {
      return true; // storage blocked: show it
    }
  });
  return {
    open,
    show: () => setOpen(true),
    close: () => {
      setOpen(false);
      try {
        window.localStorage.setItem(SEEN_KEY, "1");
      } catch {
        // storage blocked: it will show again next time
      }
    },
  };
}
