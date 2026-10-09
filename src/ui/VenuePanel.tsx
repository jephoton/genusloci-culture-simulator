import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

export function VenuePanel({
  world, frame, slot, onCloseVenue, onDismiss,
}: {
  world: World;
  frame: Frame | null;
  slot: number | null;
  onCloseVenue: (slot: number) => void;
  onDismiss: () => void;
}) {
  if (slot === null || !frame || slot >= frame.nVenues) return null;
  const entity = world.entities[frame.venueEntity[slot]];
  const open = frame.venueOpen[slot] === 1;
  const isEvent = frame.venueExpires[slot] >= 0;
  return (
    <aside className="panel pointer-events-auto absolute right-4 top-24 w-72 space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-400">{isEvent ? "Event" : (entity.kind ?? "venue").replace("_", " ")}</p>
          <h2 className="text-lg font-medium leading-tight">{entity.name}</h2>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Close panel" className="rounded px-2 text-zinc-400 hover:bg-white/10">×</button>
      </div>
      <dl className="grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-zinc-400">Status</dt>
        <dd>{open ? "Open" : "Closed"}</dd>
        <dt className="text-zinc-400">Health</dt>
        <dd className="font-mono tabular-nums">{Math.round(frame.venueHealth[slot] * 100)}%</dd>
        <dt className="text-zinc-400">Visitors this week</dt>
        <dd className="font-mono tabular-nums">{frame.venueAttendance[slot]}</dd>
      </dl>
      {open && !isEvent && (
        <button
          type="button"
          onClick={() => onCloseVenue(slot)}
          className="w-full rounded-lg border border-rose-400/40 bg-rose-500/15 py-2 text-sm text-rose-100 hover:bg-rose-500/25"
        >
          Close venue
        </button>
      )}
    </aside>
  );
}
