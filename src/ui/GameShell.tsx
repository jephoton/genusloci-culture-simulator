"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CityCanvas } from "@/render/CityCanvas";
import { buildLayout, nearestCell } from "@/render/layout";
import type { SimConfig } from "@/sim/config";
import { Hud } from "@/ui/Hud";
import { TimelineBar } from "@/ui/TimelineBar";
import { type Tool, Toolbar } from "@/ui/Toolbar";
import { useSimulation } from "@/ui/useSimulation";
import { VenuePanel } from "@/ui/VenuePanel";
import type { World } from "@/world/schema";
import { Attribution } from "@/ui/Attribution";
import { useCityWorld } from "@/ui/useCityWorld";

const DEMO_SEED = 7;
const DEMO_CONFIG: Partial<SimConfig> = { nAgents: 4000, agentReserve: 500 };
const AGENT_SLOTS = 4500;
const EVENT = { duration: 3, reachKm: 25, capacity: 3000 } as const;

function Game({ world, attribution }: { world: World; attribution: string | null }) {
  const layout = useMemo(() => buildLayout(world), [world]);
  const sim = useSimulation(world, DEMO_SEED, DEMO_CONFIG);
  const { act } = sim;
  const [tool, setTool] = useState<Tool>({ kind: "select" });
  const [selected, setSelected] = useState<number | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setTool({ kind: "select" });
      setSelected(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onGroundClick = useCallback(
    (x: number, z: number) => {
      const cell = nearestCell(layout, x, z);
      if (tool.kind === "open") {
        void act({ type: "openVenue", entity: tool.entity, cell });
        setTool({ kind: "select" });
      } else if (tool.kind === "event") {
        void act({ type: "scheduleEvent", entity: tool.entity, cell, ...EVENT });
        setTool({ kind: "select" });
      } else {
        setSelected(null);
      }
    },
    [act, layout, tool],
  );

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#07080b] text-zinc-100">
      <CityCanvas
        world={world}
        layout={layout}
        frames={sim.frames}
        frame={sim.frame}
        agentSlots={AGENT_SLOTS}
        tickMs={1000 / sim.speed}
        selectedVenue={selected}
        onVenueClick={setSelected}
        onGroundClick={onGroundClick}
        cursor={tool.kind === "select" ? "default" : "crosshair"}
      />
      <Hud city={world.city.name} digest={sim.digest} tick={sim.frame?.tick ?? 0} />
      <Toolbar world={world} tool={tool} onTool={setTool} />
      <VenuePanel
        world={world}
        frame={sim.frame}
        slot={selected}
        onCloseVenue={(venue) => void act({ type: "closeVenue", venue })}
        onDismiss={() => setSelected(null)}
      />
      <TimelineBar
        tick={sim.frame?.tick ?? 0}
        earliest={sim.frame?.earliestTick ?? 0}
        playing={sim.playing}
        speed={sim.speed}
        onPlay={sim.play}
        onPause={sim.pause}
        onSpeed={sim.setSpeed}
        onRewind={(t) => void sim.rewind(t)}
      />
      {attribution && <Attribution />}
      {sim.status === "loading" && (
        <div className="pointer-events-none absolute inset-0 grid place-items-center text-zinc-400">Growing the city…</div>
      )}
      {sim.error && (
        <div role="alert" className="pointer-events-auto absolute bottom-24 left-1/2 -translate-x-1/2 rounded-lg border border-rose-400/40 bg-rose-950/80 px-4 py-2 text-sm text-rose-100">
          {sim.error}
          <button type="button" onClick={sim.dismissError} className="ml-3 underline">Dismiss</button>
        </div>
      )}
    </div>
  );
}

const CITY = "london";

export default function GameShell() {
  const city = useCityWorld(CITY);
  if (!city) {
    return <div className="grid h-dvh place-items-center bg-[#07080b] text-zinc-400">Mapping the streets…</div>;
  }
  return <Game world={city.world} attribution={city.attribution} />;
}
