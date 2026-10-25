"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { EventPlanner } from "@/ui/EventPlanner";
import { EventCalendar } from "@/ui/EventCalendar";

export type PlanningView = "plan" | "calendar";

export function EventPlanningWorkspace({ view, onView, onClose, onCancel, ...planner }: Omit<ComponentProps<typeof EventPlanner>, "onCalendar"> & {
  view: PlanningView;
  onView: (view: PlanningView) => void;
  onClose: () => void;
  onCancel: (event: number) => void;
}) {
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => { closeButton.current?.focus(); }, []);
  return <section aria-label="Event planner workspace" onKeyDown={(e) => {
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
  }} className="panel absolute bottom-28 left-3 right-3 top-32 z-20 flex flex-col overflow-hidden lg:left-auto lg:right-4 lg:top-4 lg:w-[25rem]">
    <header className="flex shrink-0 items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
      <h2 className="text-sm font-medium">Plan an event</h2>
      <button ref={closeButton} type="button" onClick={onClose} className="rounded border border-white/15 px-2 py-1 text-xs text-violet-200">Return to experiment chat</button>
    </header>
    <nav aria-label="Event planning views" className="flex shrink-0 gap-2 border-b border-white/10 p-3 text-xs">
      <button type="button" aria-current={view === "plan" ? "page" : undefined} onClick={() => onView("plan")} className={`rounded px-3 py-2 ${view === "plan" ? "bg-violet-500/25 text-violet-100" : "bg-white/5 text-zinc-400"}`}>Artist & venues</button>
      <button type="button" aria-current={view === "calendar" ? "page" : undefined} onClick={() => onView("calendar")} className={`rounded px-3 py-2 ${view === "calendar" ? "bg-violet-500/25 text-violet-100" : "bg-white/5 text-zinc-400"}`}>Event calendar</button>
    </nav>
    <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div hidden={view !== "plan"}><EventPlanner {...planner} onCalendar={() => onView("calendar")} /></div>
      {view === "calendar" && <div className="space-y-3 text-sm">
        <p className="text-xs text-zinc-400">Playback stays paused after planning and scheduling. Return to the lab and click Play when ready.</p>
        {planner.frame?.scheduledEvents?.length ? <EventCalendar frame={planner.frame} world={planner.world} onCancel={onCancel} expanded /> : <p className="text-zinc-400">No events scheduled yet. Choose an artist and compare venues to plan one.</p>}
      </div>}
    </div>
  </section>;
}
