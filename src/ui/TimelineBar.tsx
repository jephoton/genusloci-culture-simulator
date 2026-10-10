"use client";

import { useState } from "react";
import { dayLabel } from "@/ui/words";

/** Ticks (days, in the demo) per second. Each tick plays as a night out, so 4 is about as fast as it reads. */
const SPEEDS = [
  { value: 0.5, label: "½" },
  { value: 1, label: "1" },
  { value: 2, label: "2" },
  { value: 4, label: "4" },
];

export function TimelineBar({
  tick, ticksPerWeek, earliest, playing, speed, onPlay, onPause, onSpeed, onRewind,
}: {
  tick: number;
  /** Ticks per simulated week: 7 means each tick is a day. */
  ticksPerWeek: number;
  earliest: number;
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (ticksPerSecond: number) => void;
  onRewind: (tick: number) => void;
}) {
  const [scrub, setScrub] = useState<number | null>(null);
  const unit = ticksPerWeek === 7 ? "day" : "week";
  const value = scrub ?? tick;
  const commit = () => {
    if (scrub !== null && scrub !== tick) onRewind(scrub);
    setScrub(null);
  };
  return (
    <footer className="panel pointer-events-auto absolute bottom-4 left-1/2 flex w-[min(760px,calc(100%-2rem))] -translate-x-1/2 items-center gap-3 p-3">
      <button
        type="button"
        onClick={playing ? onPause : onPlay}
        className="w-20 rounded-lg bg-violet-500/25 py-2 text-sm font-medium text-violet-100 ring-1 ring-violet-400/40 hover:bg-violet-500/35"
      >
        {playing ? "Pause" : "Play"}
      </button>
      <div className="flex items-center gap-1" role="group" aria-label={`Speed in ${unit}s per second`}>
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onSpeed(s.value)}
            aria-pressed={s.value === speed}
            aria-label={`${s.value} ${unit}s per second`}
            className={`rounded-md px-2 py-1 text-xs ${s.value === speed ? "bg-white/15" : "hover:bg-white/5"}`}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-1 text-[10px] text-zinc-500">{unit === "day" ? "day/s" : "wk/s"}</span>
      </div>
      <input
        type="range"
        aria-label={`Rewind to ${unit}`}
        className="flex-1 accent-violet-400"
        min={earliest}
        max={Math.max(tick, earliest)}
        value={value}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <span className="w-28 whitespace-nowrap text-right font-mono text-sm tabular-nums">{dayLabel(value, ticksPerWeek)}</span>
    </footer>
  );
}
