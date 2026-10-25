import { closureExplanation } from "@/sim/closures";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

export function VenuePanel({
  world, frame, slot, onCloseVenue, onDismiss, onPlan,
}: {
  world: World;
  frame: Frame | null;
  slot: number | null;
  onCloseVenue: (slot: number) => void;
  onDismiss: () => void;
  /** Opens "Plan a night here" for an open permanent venue. */
  onPlan?: (slot: number) => void;
}) {
  if (slot === null || !frame || slot >= frame.nVenues) return null;
  const entity = world.entities[frame.venueEntity[slot]];
  const open = frame.venueOpen[slot] === 1;
  const closure = frame.venueClosures?.[slot];
  const capacity = frame.venueCapacity?.[slot] ?? entity.capacity ?? 0;
  const rent = frame.venueRent?.[slot] ?? 1;
  const isEvent = frame.venueExpires[slot] >= 0;
  return (
    <aside aria-label="Venue" className="panel pointer-events-auto w-full space-y-3 p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-zinc-400">{isEvent ? "Event" : (entity.kind ?? "venue").replace("_", " ")}</p>
          <h2 className="text-lg font-medium leading-tight">{frame.venueLabels?.[slot] ?? entity.name}</h2>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Close panel" className="rounded px-2 text-zinc-400 hover:bg-white/10">×</button>
      </div>
      <p className="text-sm text-zinc-400">{open ? "Open" : "Closed"} · {frame.venueAttendance[slot]} visitors {frame.ticksPerWeek === 1 ? "this week" : "tonight"}</p>
      <details>
      <summary className="cursor-pointer py-1 text-xs text-zinc-400">Venue performance</summary>
      <dl className="mt-2 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-zinc-400">Status</dt>
        <dd>{open ? "Open" : "Closed"}</dd>
        <dt className="text-zinc-400">Health</dt>
        <dd className="font-mono tabular-nums">{Math.round(frame.venueHealth[slot] * 100)}%</dd>
        <dt className="text-zinc-400">{frame.ticksPerWeek === 1 ? "Visitors this week" : "Visitors tonight"}</dt>
        <dd className="font-mono tabular-nums">{frame.venueAttendance[slot]}</dd>
        <dt className="text-zinc-400">Rolling weekly visits</dt>
        <dd className="font-mono tabular-nums">{frame.venueWeekVisits?.[slot] ?? "—"}</dd>
        <dt className="text-zinc-400">Effective capacity</dt>
        <dd className="font-mono tabular-nums">{Math.round(capacity * rent)}</dd>
        <dt className="text-zinc-400">Rent multiplier</dt>
        <dd className="font-mono tabular-nums">{rent.toFixed(2)}×</dd>
      </dl>
      </details>
      <details className="text-xs text-zinc-500"><summary className="cursor-pointer py-1">About modeled openings</summary><p className="mt-2">Automatic openings fill underserved scenes using the closest taste profile in the city&apos;s place catalogue. Its name and type are reused as a model template. This does not mean that real business is opening at the simulated location.</p></details>
      {closure && <p className="text-sm text-zinc-300">{closureExplanation(closure)}</p>}
      {open && !isEvent && onPlan && (
        <button
          type="button"
          onClick={() => onPlan(slot)}
          className="w-full rounded-lg bg-violet-500/80 py-2 text-sm font-medium text-white hover:bg-violet-500"
        >
          Plan a night here
        </button>
      )}
      {open && !isEvent && <details>
        <summary className="cursor-pointer py-1 text-xs text-zinc-400">Venue actions</summary>
        <button
          type="button"
          onClick={() => onCloseVenue(slot)}
          className="w-full rounded-lg border border-rose-400/40 bg-rose-500/15 py-2 text-sm text-rose-100 hover:bg-rose-500/25"
        >
          Close venue
        </button>
      </details>}
    </aside>
  );
}
