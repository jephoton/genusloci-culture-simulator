import { useMemo } from "react";
import { sceneHuesOf, sceneRgb } from "@/render/palette";
import type { SimDigest } from "@/sim/digest";
import type { SceneName } from "@/agents/naming";
import type { Frame } from "@/sim/frame";

const MAX_ROWS = 8;

const css = ([r, g, b]: [number, number, number]) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

/**
 * The living scenes, largest first. Hovering a row highlights that scene on the map; clicking pins it
 * and flies there. Scenes show their name once named, else "Scene N".
 */
export function SceneLegend({
  digest, frame, names, pinned, focused, onHover, onPin, onClear, onTalk,
}: {
  digest: SimDigest | null;
  /** Scene names by lineage id, as they arrive. */
  names?: ReadonlyMap<number, SceneName>;
  frame: Frame | null;
  /** The pinned scene, if any. */
  pinned: number | null;
  /** True while anything (a scene or a venue) is focused. */
  focused: boolean;
  onHover: (scene: number | null) => void;
  onPin: (scene: number) => void;
  onClear: () => void;
  /** Opens an interview with a typical member of the scene. */
  onTalk?: (scene: number) => void;
}) {
  const hues = useMemo(() => (frame ? sceneHuesOf(frame.lineageParents) : new Float32Array(0)), [frame]);
  const scenes = (digest?.scenes ?? []).slice(0, MAX_ROWS);
  return (
    <aside aria-label="Scenes" className="panel pointer-events-auto min-h-0 w-full space-y-2 overflow-y-auto p-3" onMouseLeave={() => onHover(null)}>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-medium">Scenes</h2>
        {focused && (
          <button type="button" onClick={onClear} className="rounded px-2 py-0.5 text-xs text-violet-200 hover:bg-white/10">
            Clear focus
          </button>
        )}
      </div>
      <p className="text-xs text-zinc-400">Groups of people with shared taste. Hover to highlight one; click to follow it.</p>
      {scenes.length === 0 && <p className="text-xs text-zinc-400">No scenes yet. Press Play and they will form.</p>}
      <ul className="space-y-1">
        {scenes.map((s) => {
          const top = s.topEntities.slice(0, 2).map((e) => e.name).join(", ");
          const active = pinned === s.id;
          const named = names?.get(s.id);
          return (
            <li key={s.id} className="flex items-center gap-1">
              <button
                type="button"
                aria-pressed={active}
                aria-label={`${named?.name ?? `Scene ${s.id}`}, ${s.size} people${top ? `, into ${top}` : ""}`}
                onMouseEnter={() => onHover(s.id)}
                onFocus={() => onHover(s.id)}
                onBlur={() => onHover(null)}
                onClick={() => onPin(s.id)}
                className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left transition ${
                  active ? "bg-white/15 ring-1 ring-white/30" : "hover:bg-white/10"
                }`}
              >
                <span aria-hidden className="size-3 shrink-0 rounded-full" style={{ background: css(sceneRgb(hues, s.id)) }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-zinc-100">{named?.name ?? `Scene ${s.id}`}</span>
                  {top && <span className="block truncate text-xs text-zinc-400">{top}</span>}
                </span>
                <span className="shrink-0 text-xs tabular-nums text-zinc-300">{s.size} people</span>
              </button>
              {onTalk && (
                <button
                  type="button"
                  onClick={() => onTalk(s.id)}
                  title="Talk to a resident from this scene"
                  aria-label={`Talk to a resident from ${named?.name ?? `scene ${s.id}`}`}
                  className="shrink-0 rounded-md px-1.5 py-1 text-xs text-violet-200 hover:bg-white/10"
                >
                  Talk
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
