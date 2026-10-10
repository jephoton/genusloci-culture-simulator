"use client";

import { useState } from "react";

/** Weeks per second. Each week plays as a night out; at 1 wk/s agents barely have time to linger, so 1 is the maximum. */
const SPEEDS = [
  { value: 0.125, label: "⅛" },
  { value: 0.25, label: "¼" },
  { value: 0.5, label: "½" },
  { value: 1, label: "1" },
];

export function TimelineBar({
  tick, earliest, playing, speed, onPlay, onPause, onSpeed, onRewind,
}: {
  tick: number;
  earliest: number;
  playing: boolean;
  speed: number;
  onPlay: () => void;
  onPause: () => void;
  onSpeed: (ticksPerSecond: number) => void;
  onRewind: (tick: number) => void;
}) {
  const [scrub, setScrub] = useState<number | null>(null);
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
      <div className="flex items-center gap-1" role="group" aria-label="Speed in weeks per second">
        {SPEEDS.map((s) => (
          <button
            key={s.value}
            type="button"
            onClick={() => onSpeed(s.value)}
            aria-pressed={s.value === speed}
            aria-label={`${s.value} weeks per second`}
            className={`rounded-md px-2 py-1 text-xs ${s.value === speed ? "bg-white/15" : "hover:bg-white/5"}`}
          >
            {s.label}
          </button>
        ))}
        <span className="ml-1 text-[10px] text-zinc-500">wk/s</span>
      </div>
      <input
        type="range"
        aria-label="Rewind to week"
        className="flex-1 accent-violet-400"
        min={earliest}
        max={Math.max(tick, earliest)}
        value={value}
        onChange={(e) => setScrub(Number(e.target.value))}
        onPointerUp={commit}
        onKeyUp={commit}
      />
      <span className="w-20 text-right font-mono text-sm tabular-nums">Week {value}</span>
    </footer>
  );
}
