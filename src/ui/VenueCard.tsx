"use client";

import { sceneHuesOf, sceneRgb } from "@/render/palette";
import { type ClosureRules, isStruggling } from "@/render/venues";
import { closureExplanation } from "@/sim/closures";
import type { SimDigest } from "@/sim/digest";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";
import { plural } from "@/ui/words";

const css = ([r, g, b]: [number, number, number]) => `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)})`;

/** Tag families that say who people are or what a place is like, not what they're into. */
const NOT_TASTES = [":age_range:", ":category:", ":noise_level:", ":time_of_day_fit:", ":inclusivity:", ":decor:", ":culinary_style:"];

/** A scene's label: the two things its people like most, artists first (scene names aren't generated in this build). */
export function sceneLabel(digest: SimDigest | null, id: number, world: Pick<World, "entities">): string {
  const top = (digest?.scenes.find((s) => s.id === id)?.topEntities ?? [])
    .filter((e) => !NOT_TASTES.some((t) => world.entities[e.index]?.id.includes(t)))
    .sort((a, b) => Number(world.entities[b.index]?.type === "artist") - Number(world.entities[a.index]?.type === "artist"))
    .slice(0, 2)
    .map((e) => e.name);
  return top.length ? top.join(" · ") : `Scene ${id}`;
}

/** Residents who went to `slot` in the last simulated week, by their current scene, largest first. */
export function regularsByScene(frame: Frame, slot: number): { scene: number; count: number }[] {
  const out = new Map<number, number>();
  const tpw = frame.ticksPerWeek;
  if (!frame.attendanceHistory) return [];
  for (let a = 0; a < frame.alive.length; a++) {
    if (!frame.alive[a]) continue;
    for (let k = 0; k < tpw; k++) {
      if (frame.attendanceHistory[a * tpw + k] !== slot) continue;
      out.set(frame.scene[a], (out.get(frame.scene[a]) ?? 0) + 1);
      break;
    }
  }
  return [...out].map(([scene, count]) => ({ scene, count })).sort((x, y) => y.count - x.count || x.scene - y.scene);
}

/** What a venue is, how it's doing, and whose place it is. Shown on hover (compact) and on click. */
export function VenueCard({ world, frame, digest, slot, area, rules, raceLetter, compact = false, onClose }: {
  world: World;
  frame: Frame;
  digest: SimDigest | null;
  slot: number;
  area: string;
  rules: ClosureRules;
  /** Its letter if it's in the race. */
  raceLetter?: string;
  compact?: boolean;
  onClose?: () => void;
}) {
  if (slot >= frame.nVenues) return null;
  const entity = world.entities[frame.venueEntity[slot]];
  const name = frame.venueLabels?.[slot] ?? entity.name;
  const open = frame.venueOpen[slot] === 1;
  const isEvent = frame.venueExpires[slot] >= 0;
  const struggling = isStruggling(frame, slot, rules);
  const closure = frame.venueClosures?.[slot];
  const regulars = regularsByScene(frame, slot);
  const total = regulars.reduce((a, r) => a + r.count, 0);
  const hues = sceneHuesOf(frame.lineageParents);
  const status = !open ? "Closed" : isEvent ? "Event" : struggling ? "Struggling" : "Doing fine";
  return (
    <div className={compact ? "panel pointer-events-none max-w-60 px-3 py-2 text-xs" : "panel pointer-events-auto w-72 space-y-2 p-3 text-xs"}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-zinc-50">{raceLetter && <span className="mr-1 text-violet-200">{raceLetter} ·</span>}{name}</p>
          <p className="truncate text-zinc-400">{(entity.kind ?? "venue").replace("_", " ")}{area && ` · ${area}`}</p>
        </div>
        {onClose && <button type="button" onClick={onClose} aria-label="Close venue" className="rounded px-1.5 text-zinc-400 hover:bg-white/10">×</button>}
      </div>
      <p className={struggling ? "text-rose-300" : "text-zinc-300"}>
        {status} · {plural(total, "regular")} this week
      </p>
      {struggling && <p className="text-zinc-400">The red ring means it draws too few visitors for its size (health {Math.round(frame.venueHealth[slot] * 100)}%, below {Math.round(rules.closeThreshold * 100)}%). If that lasts, it closes.</p>}
      {!compact && closure && !open && <p className="text-zinc-400">{closureExplanation(closure)}</p>}
      {!compact && regulars.length > 0 && (
        <div>
          <p className="mb-1 text-zinc-400">Its regulars, by taste scene</p>
          <ul className="space-y-0.5">
            {regulars.slice(0, 4).map((r) => (
              <li key={r.scene} className="flex items-center gap-2">
                <span aria-hidden className="size-2.5 shrink-0 rounded-full" style={{ background: r.scene >= 0 ? css(sceneRgb(hues, r.scene)) : "#71717a" }} />
                <span className="min-w-0 flex-1 truncate text-zinc-200">{r.scene >= 0 ? sceneLabel(digest, r.scene, world) : "No scene yet"}</span>
                <span className="tabular-nums text-zinc-400">{r.count}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {!compact && entity.tags.length > 0 && <p className="text-zinc-500">Qloo: {entity.tags.filter((t) => !t.includes(":category:")).slice(0, 5).map((t) => (t.split(":").at(-1) ?? t).replace(/_/g, " ")).join(", ")}</p>}
    </div>
  );
}
