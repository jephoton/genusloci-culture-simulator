"use client";

import { useState } from "react";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";
import { kindWord } from "@/ui/words";

/** A keyboard-accessible entry to booking, without needing to pick tiny map landmarks. */
export function VenueDirectory({ world, frame, onSelect }: { world: World; frame: Frame | null; onSelect: (slot: number) => void }) {
  const [query, setQuery] = useState("");
  const needle = query.trim().toLowerCase();
  const venues = frame ? Array.from({ length: frame.nVenues }, (_, slot) => slot)
    .filter((slot) => frame.venueOpen[slot] === 1 && frame.venueExpires[slot] < 0)
    .map((slot) => ({ slot, entity: world.entities[frame.venueEntity[slot]], name: frame.venueLabels?.[slot] ?? world.entities[frame.venueEntity[slot]].name }))
    .filter(({ name, entity }) => `${name} ${kindWord(entity.kind ?? "other")}`.toLowerCase().includes(needle))
    .sort((a, b) => a.name.localeCompare(b.name)) : [];
  return (
    <section className="space-y-3" aria-label="Choose a venue">
      <p className="text-sm text-zinc-400">Choose a venue, compare acts, then plan a night.</p>
      <input type="search" aria-label="Find a venue" placeholder="Find a venue…" value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-lg border border-white/15 bg-black/30 px-3 py-2 text-sm outline-none focus:border-violet-400" />
      {!frame ? <p role="status" className="text-sm text-zinc-400">Loading venues…</p> : (
        <ul className="space-y-1">
          {venues.map(({ slot, entity, name }) => (
            <li key={slot}><button type="button" onClick={() => onSelect(slot)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-3 text-left hover:bg-white/10 focus-visible:outline-violet-400">
              <span className="min-w-0"><span className="block truncate text-sm">{name}</span><span className="block text-xs text-zinc-500">{kindWord(entity.kind ?? "other")}</span></span>
              <span aria-hidden className="text-zinc-500">↗</span>
            </button></li>
          ))}
        </ul>
      )}
      {frame && venues.length === 0 && <p className="text-sm text-zinc-400">No open venues match. Try another name or kind.</p>}
    </section>
  );
}
