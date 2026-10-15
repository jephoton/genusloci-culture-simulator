"use client";

import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function EventCalendar({ frame, world, onCancel }: { frame: Frame; world: World; onCancel: (id: number) => void }) {
  const all = [...(frame.scheduledEvents ?? [])].sort((a, b) => b.id - a.id);
  const active = all.filter((e) => e.status === "scheduled" || e.status === "started");
  const events = [...active, ...all.filter((e) => e.status !== "scheduled" && e.status !== "started").slice(0, 12)];
  if (!events.length) return null;
  return <details className="panel pointer-events-auto max-h-52 overflow-y-auto p-3 text-xs">
    <summary className="cursor-pointer">Event calendar ({active.filter((e) => e.status === "scheduled").length} upcoming)</summary>
    <ul className="mt-2 space-y-2">{events.map((e) => <li key={e.id}>
      <p className="font-medium">{e.action.label ?? world.entities[e.action.entity]?.name ?? "Event"}</p>
      <p>Week {Math.floor(e.startTick / frame.ticksPerWeek)}{frame.ticksPerWeek === 7 ? ` · ${DAYS[e.startTick % 7]}` : ""} · {e.status}</p>
      {e.error && <p role="alert" className="text-rose-300">{e.error}</p>}
      {(e.status === "scheduled" || e.status === "started") && <button type="button" onClick={() => onCancel(e.id)} className="mt-1 rounded bg-white/10 px-2 py-1" aria-label={`Cancel ${e.action.label ?? "event"}`}>Cancel booking</button>}
    </li>)}</ul>
  </details>;
}
