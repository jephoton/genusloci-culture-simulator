"use client";

import { useMemo, useState } from "react";
import type { World } from "@/world/schema";

export type Tool = { kind: "select" } | { kind: "open"; entity: number } | { kind: "event"; entity: number };

function ToolButton({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`w-full rounded-lg px-3 py-2 text-left text-sm transition ${
        active ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/50" : "hover:bg-white/5"
      }`}
    >
      {label}
    </button>
  );
}

export function Toolbar({ world, tool, onTool }: { world: World; tool: Tool; onTool: (tool: Tool) => void }) {
  const places = useMemo(() => world.entities.flatMap((e, i) => (e.type === "place" ? [{ i, name: e.name }] : [])), [world]);
  const artists = useMemo(() => world.entities.flatMap((e, i) => (e.type === "artist" ? [{ i, name: e.name }] : [])), [world]);
  const [place, setPlace] = useState(places[0]?.i ?? -1);
  const [artist, setArtist] = useState(artists[0]?.i ?? -1);
  const select = "w-full rounded-md border border-white/10 bg-black/40 px-2 py-1 text-xs";

  return (
    <aside className="panel pointer-events-auto absolute left-4 top-24 w-60 space-y-3 p-3">
      <ToolButton active={tool.kind === "select"} label="Select" onClick={() => onTool({ kind: "select" })} />
      <div className="space-y-1">
        <ToolButton active={tool.kind === "open"} label="Open a venue" onClick={() => place >= 0 && onTool({ kind: "open", entity: place })} />
        <select
          aria-label="Place to open"
          className={select}
          value={place}
          onChange={(e) => {
            const v = Number(e.target.value);
            setPlace(v);
            if (tool.kind === "open") onTool({ kind: "open", entity: v });
          }}
        >
          {places.map((p) => <option key={p.i} value={p.i}>{p.name}</option>)}
        </select>
      </div>
      <div className="space-y-1">
        <ToolButton active={tool.kind === "event"} label="Throw an event" onClick={() => artist >= 0 && onTool({ kind: "event", entity: artist })} />
        <select
          aria-label="Headliner"
          className={select}
          value={artist}
          onChange={(e) => {
            const v = Number(e.target.value);
            setArtist(v);
            if (tool.kind === "event") onTool({ kind: "event", entity: v });
          }}
        >
          {artists.map((a) => <option key={a.i} value={a.i}>{a.name}</option>)}
        </select>
      </div>
      {tool.kind !== "select" && <p className="text-xs text-amber-200">Click the map to place it. Esc cancels.</p>}
    </aside>
  );
}
