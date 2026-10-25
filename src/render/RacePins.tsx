"use client";

import { Html } from "@react-three/drei";

/** A race candidate's badge over its venue: letter, colour and an optional live count. */
export type RacePin = { x: number; z: number; letter: string; colour: string; label?: string; leading?: boolean };

export const BADGE_Y = 16;

/** Lettered badges over the race venues, in each candidate's colour. */
export function RacePins({ pins }: { pins: RacePin[] }) {
  return (
    <group>
      {pins.map((p) => (
        <Html key={p.letter} position={[p.x, BADGE_Y, p.z]} center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
          <div
            aria-hidden
            className={`flex select-none items-center gap-1.5 whitespace-nowrap rounded-full border-2 bg-zinc-950/85 px-2.5 py-0.5 text-sm font-semibold shadow-lg transition-transform duration-200 ${p.leading ? "scale-125" : ""}`}
            style={{ borderColor: p.colour, color: p.colour }}
          >
            {p.letter}
            {p.label && <span className="text-xs font-normal text-zinc-100">{p.label}</span>}
          </div>
        </Html>
      ))}
    </group>
  );
}
