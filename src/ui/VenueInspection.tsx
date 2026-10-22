"use client";

import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

export function VenueInspection({ world, frame, slot, onClose }: { world: World; frame: Frame; slot: number; onClose: () => void }) {
  if (slot < 0 || slot >= frame.nVenues) return null;
  const name = frame.venueLabels?.[slot] ?? world.entities[frame.venueEntity[slot]]?.name ?? "Venue";
  const health = frame.venueHealth[slot];
  return <section aria-label="Selected venue" className="panel absolute left-3 top-52 z-10 max-w-64 space-y-1 px-3 py-3 text-xs text-zinc-200">
    <div className="flex items-start gap-3"><h2 className="text-sm font-medium">{name}</h2><button type="button" onClick={onClose} aria-label="Close venue details" className="ml-auto text-zinc-400">×</button></div>
    <p>{frame.venueOpen[slot] ? "Open" : "Closed"} in the model · Health {Number.isFinite(health) ? `${Math.round(health * 100)}%` : "unavailable"}</p>
    <p>{frame.venueAttendance[slot] ?? 0} current simulated visits</p>
    <p className="text-[10px] text-zinc-400">Health is the model’s venue viability score, not real business data.</p>
  </section>;
}
