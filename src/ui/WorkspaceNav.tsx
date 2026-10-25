"use client";

import { useRef, type RefObject } from "react";

export type WorkspacePanel = "plan" | "venues" | "scenes" | "tools" | "copilot";

export function WorkspaceNav({ panel, onOpen, navigationRef }: { panel: WorkspacePanel | null; onOpen: (panel: WorkspacePanel) => void; navigationRef: RefObject<HTMLElement | null> }) {
  const explore = useRef<HTMLDetailsElement>(null);
  const exploring = panel === "venues" || panel === "scenes" || panel === "tools";
  const button = "panel whitespace-nowrap px-3 py-2.5 text-xs sm:px-4 sm:text-sm";
  return <nav ref={navigationRef} aria-label="Workspace" className="pointer-events-auto absolute left-2 right-2 top-[5.25rem] z-10 flex gap-2 md:left-auto md:right-4 md:top-4">
    <button type="button" data-workspace-active={panel === "plan"} aria-expanded={panel === "plan"} aria-controls="workspace-drawer" onClick={() => onOpen("plan")} className={`${button} flex-1 ${panel === "plan" ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/50" : "text-zinc-200"}`}>Plan event</button>
    <details ref={explore} className="relative flex-1" onKeyDown={(e) => { if (e.key === "Escape" && e.currentTarget.open) { e.preventDefault(); e.stopPropagation(); e.currentTarget.open = false; e.currentTarget.querySelector("summary")?.focus(); } }}>
      <summary data-workspace-active={exploring} className={`${button} cursor-pointer text-center ${exploring ? "text-violet-200" : "text-zinc-400"}`}>Explore city</summary>
      <div className="panel absolute right-0 top-full mt-2 w-48 space-y-1 p-2">{([ ["venues", "Venue directory"], ["scenes", "Scenes & crowds"], ["tools", "City sandbox"] ] as const).map(([key, label]) => <button key={key} type="button" onClick={() => { if (explore.current) explore.current.open = false; onOpen(key); }} className="block w-full rounded-md px-3 py-2 text-left text-xs text-zinc-300 hover:bg-white/10">{label}</button>)}</div>
    </details>
    <button type="button" data-workspace-active={panel === "copilot"} aria-expanded={panel === "copilot"} aria-controls="workspace-drawer" onClick={() => onOpen("copilot")} className={`${button} flex-1 ${panel === "copilot" ? "bg-violet-500/25 text-violet-100 ring-1 ring-violet-400/50" : "text-zinc-400"}`}>Co-pilot</button>
  </nav>;
}
