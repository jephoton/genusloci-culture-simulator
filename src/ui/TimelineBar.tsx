"use client";

import { useState } from "react";

const SPEEDS = [1, 2, 4, 8];

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
      <div className="flex gap-1" role="group" aria-label="Speed">
        {SPEEDS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onSpeed(s)}
            aria-pressed={s === speed}
            className={`rounded-md px-2 py-1 text-xs ${s === speed ? "bg-white/15" : "hover:bg-white/5"}`}
          >
            {s}×
          </button>
        ))}
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
