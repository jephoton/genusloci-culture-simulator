"use client";

import { useMemo, useState } from "react";
import type { SimDigest } from "@/sim/digest";
import { VENUE_KIND_LABELS } from "@/ui/words";
import type { VenueKind, World } from "@/world/schema";

/**
 * The active tool. "open" and "event" first pick what to place (`venueKind` / `entity` null), then
 * place it with a click on the map. "scout" picks a headliner, then compares spots for them; a map
 * click there tries the player's own spot.
 */
export type Tool =
  | { kind: "select" }
  | { kind: "open"; venueKind: VenueKind | null }
  | { kind: "event"; entity: number | null }
  | { kind: "scout"; entity: number | null };

/** True once the tool has something to place (or, scouting, a spot to try), so a map click acts. */
export function isPlacing(tool: Tool): boolean {
  return (tool.kind === "open" && tool.venueKind !== null) || ((tool.kind === "event" || tool.kind === "scout") && tool.entity !== null);
}

function ToolButton({ active, label, hint, onClick }: { active: boolean; label: string; hint: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
        active ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/50" : "hover:bg-white/5"
      }`}
    >
      <span className="block">{label}</span>
      <span className="block text-xs text-zinc-400">{hint}</span>
    </button>
  );
}

function Choice({ active, label, disabled, title, onClick }: { active: boolean; label: string; disabled?: boolean; title?: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      disabled={disabled}
      title={title}
      className={`rounded-md px-2 py-1.5 text-left text-xs transition disabled:cursor-not-allowed disabled:opacity-40 ${
        active ? "bg-amber-400/20 text-amber-100 ring-1 ring-amber-300/60" : "bg-white/5 hover:bg-white/10"
      }`}
    >
      {label}
    </button>
  );
}

type Group = { title: string; artists: { i: number; name: string }[] };

/** Headliners grouped by the living scene they define (largest first); everyone else last. */
export const defaultSceneTitle = (id: number) => `Scene ${id}`;

function headlinerGroups(world: World, digest: SimDigest | null, sceneTitle: (id: number) => string): Group[] {
  const groups: Group[] = [];
  const used = new Set<number>();
  for (const scene of digest?.scenes ?? []) {
    const artists = scene.topEntities
      .filter((e) => world.entities[e.index]?.type === "artist" && !used.has(e.index))
      .map((e) => ({ i: e.index, name: e.name }));
    if (artists.length === 0) continue;
    for (const a of artists) used.add(a.i);
    groups.push({ title: `Loved by ${sceneTitle(scene.id)}`, artists });
  }
  const rest = world.entities.flatMap((e, i) => (e.type === "artist" && !used.has(i) ? [{ i, name: e.name }] : []));
  if (rest.length > 0) groups.push({ title: groups.length > 0 ? "Other headliners" : "Headliners", artists: rest });
  return groups;
}

/** The filterable headliner list shared by "Throw an event" and "Scout a location". */
function HeadlinerPicker({ groups, selected, onPick }: { groups: Group[]; selected: number | null; onPick: (entity: number) => void }) {
  const [filter, setFilter] = useState("");
  const needle = filter.trim().toLowerCase();
  const shown = needle
    ? groups.map((g) => ({ ...g, artists: g.artists.filter((a) => a.name.toLowerCase().includes(needle)) })).filter((g) => g.artists.length > 0)
    : groups;
  return (
    <div className="flex min-h-0 flex-col gap-2">
      <input
        type="search"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Filter headliners"
        aria-label="Filter headliners"
        className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs placeholder:text-zinc-500"
      />
      <div role="group" aria-label="Headliner" className="min-h-0 space-y-2 overflow-y-auto pr-1">
        {shown.map((g) => (
          <div key={g.title} className="space-y-1">
            <p className="text-[11px] uppercase tracking-widest text-zinc-400">{g.title}</p>
            <div className="flex flex-col gap-1">
              {g.artists.map((a) => (
                <Choice key={a.i} label={a.name} active={selected === a.i} onClick={() => onPick(a.i)} />
              ))}
            </div>
          </div>
        ))}
        {shown.length === 0 && <p className="text-xs text-zinc-400">No headliners match.</p>}
      </div>
    </div>
  );
}

export function Toolbar({
  world, digest, tool, onTool, sceneTitle = defaultSceneTitle, mobileOpen = false,
}: {
  world: World;
  /** On phones the toolbar is a panel opened from the tab row; always shown from the `sm` breakpoint. */
  mobileOpen?: boolean;
  /** A scene's display name (its field-guide name once named). */
  sceneTitle?: (id: number) => string;
  digest: SimDigest | null;
  tool: Tool;
  onTool: (tool: Tool) => void;
}) {
  const kindsHere = useMemo(() => new Set(world.entities.flatMap((e) => (e.type === "place" ? [e.kind ?? "other"] : []))), [world]);
  const groups = useMemo(() => headlinerGroups(world, digest, sceneTitle), [world, digest, sceneTitle]);

  let step: string | null = null;
  if (tool.kind === "open") {
    step = tool.venueKind === null ? "Pick a kind of venue." : "Move over the map and click where it should open. Esc cancels.";
  } else if (tool.kind === "event") {
    step = tool.entity === null ? "Pick a headliner." : "Move over the map and click where it should happen. Esc cancels.";
  } else if (tool.kind === "scout") {
    step = tool.entity === null ? "Pick a headliner to find them a spot." : "Click the map to test a spot of your own (D). Esc cancels.";
  }

  return (
    <aside
      aria-label="Tools"
      className={`panel pointer-events-auto absolute left-2 right-2 top-28 ${mobileOpen ? "flex" : "hidden"} max-h-[calc(100dvh-13rem)] flex-col gap-2 p-3 sm:left-4 sm:right-auto sm:top-24 sm:flex sm:max-h-[calc(100dvh-12rem)] sm:w-64`}
    >
      <ToolButton active={tool.kind === "select"} label="Select" hint="Click a venue to see how it is doing." onClick={() => onTool({ kind: "select" })} />
      <ToolButton
        active={tool.kind === "open"}
        label="Open a venue"
        hint="Add a new place for people to go."
        onClick={() => onTool(tool.kind === "open" ? { kind: "select" } : { kind: "open", venueKind: null })}
      />
      {tool.kind === "open" && (
        <div role="group" aria-label="Kind of venue" className="grid grid-cols-2 gap-1">
          {VENUE_KIND_LABELS.map(({ kind, label }) => (
            <Choice
              key={kind}
              label={label}
              active={tool.venueKind === kind}
              disabled={!kindsHere.has(kind)}
              title={kindsHere.has(kind) ? undefined : "There are no places of this kind in this city yet."}
              onClick={() => onTool({ kind: "open", venueKind: kind })}
            />
          ))}
        </div>
      )}
      <ToolButton
        active={tool.kind === "event"}
        label="Throw an event"
        hint="A one-off night that draws a crowd for 3 weeks."
        onClick={() => onTool(tool.kind === "event" ? { kind: "select" } : { kind: "event", entity: null })}
      />
      {tool.kind === "event" && <HeadlinerPicker groups={groups} selected={tool.entity} onPick={(entity) => onTool({ kind: "event", entity })} />}
      <ToolButton
        active={tool.kind === "scout"}
        label="Scout a location"
        hint="Find the best spot for a headliner."
        onClick={() => onTool(tool.kind === "scout" ? { kind: "select" } : { kind: "scout", entity: null })}
      />
      {tool.kind === "scout" && <HeadlinerPicker groups={groups} selected={tool.entity} onPick={(entity) => onTool({ kind: "scout", entity })} />}
      {step && (
        <p role="status" className="text-xs text-amber-200">
          {step}
        </p>
      )}
    </aside>
  );
}
