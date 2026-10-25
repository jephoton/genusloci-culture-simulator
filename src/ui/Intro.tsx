"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "genusloci.intro.v2";

/** First-visit intro: the question, the flow, and what is real versus simulated. Remembered per browser. */
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
            Which venue in {city} would draw the biggest crowd for an artist? Pick the artist, and a scout agent uses Qloo&apos;s taste data to choose three venues that fit. Then they race: each venue hosts the artist in its own copy of the same simulated city, night by night.
          </p>
        </header>
        <div className="space-y-1.5">
          <h3 className="text-xs uppercase tracking-wide text-zinc-400">How it works</h3>
          <ol className="list-decimal space-y-1 pl-5">
            <li><span className="text-zinc-50">Artist:</span> anyone in the city&apos;s data, or any artist Qloo knows.</li>
            <li><span className="text-zinc-50">Venues A, B, C:</span> the agent says why it picked each. Each glows in its own colour, along with its regulars.</li>
            <li><span className="text-zinc-50">Race:</span> watch each venue&apos;s event visitors walk there and the tallies climb. The result checks the winner against two more futures with different luck.</li>
            <li><span className="text-zinc-50">Change anything</span> from the step tabs (artist, venues, first night, nights) and race again.</li>
          </ol>
        </div>
        <details className="space-y-1.5">
          <summary className="cursor-pointer text-xs uppercase tracking-wide text-zinc-400">What&apos;s real and what&apos;s simulated</summary>
          <ul className="space-y-1">
            <li><span className="text-zinc-50">Real:</span> the venues, their taste tags and artist affinities (Qloo), and the streets (OpenStreetMap).</li>
            <li><span className="text-zinc-50">AI:</span> the agent&apos;s picks and write-ups (it can be wrong; the numbers come from the simulation).</li>
            <li><span className="text-zinc-50">Simulated:</span> the residents, their nights out and how tastes spread. The numbers are visits by simulated people, not ticket sales.</li>
            <li>Racing never changes the live city.</li>
          </ul>
        </details>
        <div className="flex justify-end">
          <button type="button" onClick={onClose} autoFocus className="rounded-md bg-violet-500/80 px-4 py-1.5 text-sm text-white hover:bg-violet-500">
            Start
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
