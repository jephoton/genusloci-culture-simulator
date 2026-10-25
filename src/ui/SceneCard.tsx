"use client";

import type { sceneInfo } from "@/agents/city";
import { type SizePoint, sparkPoints } from "@/ui/scene-history";

type Info = Exclude<ReturnType<typeof sceneInfo>, { error: string }>;

const W = 220;
const H = 36;

/** Details of the pinned scene: what it likes, where it lives and goes, how it has grown, and its family. */
export function SceneCard({
  info,
  title,
  history,
  splitInto,
  colour,
  ticksPerWeek,
  onPin,
  onTalk,
}: {
  ticksPerWeek: number;
  info: Info;
  title: (id: number) => string;
  history: readonly SizePoint[];
  /** Live scenes that split off this one. */
  splitInto: number[];
  colour: string;
  onPin: (scene: number) => void;
  onTalk?: (scene: number) => void;
}) {
  // Different Qloo tags can share a name (e.g. "Historic" as decor and as a neighbourhood trait).
  const unique = (names: string[]) => [...new Set(names)];
  const artists = unique(info.tastes.filter((t) => t.type === "artist").map((t) => t.name));
  const tags = unique(info.tastes.filter((t) => t.type !== "artist").map((t) => t.name));
  const first = history[0]?.size;
  const change = first !== undefined ? info.size - first : 0;
  return (
    <aside aria-label={`Scene: ${title(info.scene)}`} className="panel pointer-events-auto w-full space-y-2.5 p-4 text-sm">
      <header className="flex items-start gap-2">
        <span aria-hidden className="mt-1.5 size-3 shrink-0 rounded-full" style={{ background: colour }} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-medium">{title(info.scene)}</h2>
          <p className="text-xs text-zinc-400">
            {info.size} people
            {history.length > 1 && change !== 0 && (
              <span className={change > 0 ? "text-emerald-300" : "text-rose-300"}> ({change > 0 ? "+" : ""}{change} since week {Math.floor(history[0].tick / Math.max(1, ticksPerWeek))})</span>
            )}
            {" · "}formed in week {info.bornWeek}
          </p>
        </div>
      </header>
      {history.length > 1 && (
        <svg viewBox={`0 0 ${W} ${H}`} className="h-9 w-full" role="img" aria-label={`Size over time, from ${history[0].size} to ${info.size} people`}>
          <polyline points={sparkPoints(history, W, H - 2)} fill="none" stroke={colour} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
      )}
      {tags.length > 0 && (
        <p>
          <span className="text-xs text-zinc-400">Into </span>
          {tags.slice(0, 5).join(", ")}
        </p>
      )}
      {artists.length > 0 && (
        <p>
          <span className="text-xs text-zinc-400">Listens to </span>
          {artists.slice(0, 4).join(", ")}
        </p>
      )}
      {info.homes.length > 0 && (
        <p>
          <span className="text-xs text-zinc-400">Lives in </span>
          {info.homes.slice(0, 3).join(", ")}
        </p>
      )}
      {info.goesTonightTo.length > 0 && (
        <p>
          <span className="text-xs text-zinc-400">Out tonight at </span>
          {info.goesTonightTo.slice(0, 3).map((v) => v.name).join(", ")}
        </p>
      )}
      {(info.splitFrom !== null || splitInto.length > 0) && (
        <div className="space-y-1 text-xs">
          {info.splitFrom !== null && (
            <p>
              <span className="text-zinc-400">Split from </span>
              <button type="button" onClick={() => onPin(info.splitFrom!)} className="underline decoration-zinc-500 underline-offset-2 hover:text-zinc-50">
                {title(info.splitFrom)}
              </button>
            </p>
          )}
          {splitInto.length > 0 && (
            <p>
              <span className="text-zinc-400">Split into </span>
              {splitInto.map((c, i) => (
                <span key={c}>
                  {i > 0 && ", "}
                  <button type="button" onClick={() => onPin(c)} className="underline decoration-zinc-500 underline-offset-2 hover:text-zinc-50">
                    {title(c)}
                  </button>
                </span>
              ))}
            </p>
          )}
        </div>
      )}
      {onTalk && <button type="button" onClick={() => onTalk(info.scene)} className="w-full rounded-lg bg-white/10 py-1.5 text-sm hover:bg-white/15">
        Talk to someone from this scene
      </button>}
    </aside>
  );
}
