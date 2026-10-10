"use client";

import { Html } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CityLayout } from "@/render/layout";

/** A scouted spot: its cell, pin letter, and whether it is the player's own (D). */
export type ScoutPin = { cell: number; letter: string; own: boolean };

const AMBER = new THREE.Color(1, 0.72, 0.3);
const VIOLET = new THREE.Color(0.72, 0.62, 1);
const BEAM_HEIGHT = 34;
const BEAM_RADIUS = 0.55;
const PULSE_HZ = 0.9;
const RISE_S = 0.6;
/** Time constant of the glide into and out of the highlight. */
const HIGHLIGHT_S = 0.15;

function Pin({ layout, pin, highlighted, best }: { layout: CityLayout; pin: ScoutPin; highlighted: boolean; best: boolean }) {
  const beamRef = useRef<THREE.Mesh>(null);
  const anim = useRef({ rise: 0, glow: 0 });
  const color = pin.own ? VIOLET : AMBER;
  const mats = useMemo(
    () => ({
      beam: new THREE.MeshBasicMaterial({
        color, toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
      ring: new THREE.MeshBasicMaterial({ color, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
    }),
    [color],
  );
  useEffect(
    () => () => {
      mats.beam.dispose();
      mats.ring.dispose();
    },
    [mats],
  );

  useFrame((state, delta) => {
    const dt = Math.min(1 / 15, Math.max(0, delta));
    const a = anim.current;
    a.rise = Math.min(1, a.rise + dt / RISE_S);
    a.glow += ((highlighted ? 1 : 0) - a.glow) * (1 - Math.exp(-dt / HIGHLIGHT_S));
    const pulse = 0.5 + 0.5 * Math.sin(state.clock.elapsedTime * PULSE_HZ * Math.PI * 2);
    const rise = 1 - (1 - a.rise) ** 3;
    if (beamRef.current) {
      beamRef.current.scale.set(1 + 0.6 * a.glow, Math.max(0.001, rise), 1 + 0.6 * a.glow);
      beamRef.current.position.y = (BEAM_HEIGHT * rise) / 2;
    }
    // Hook values change through methods, never reassignment.
    mats.beam.setValues({ opacity: (0.12 + 0.06 * pulse) * (1 + 1.3 * a.glow) });
    mats.ring.setValues({ opacity: (0.45 + 0.25 * pulse) * (0.7 + 0.6 * a.glow) });
  });

  const x = layout.cellX[pin.cell];
  const z = layout.cellZ[pin.cell];
  const ring = layout.spacing * 0.32;
  return (
    <group position={[x, 0, z]}>
      <mesh rotation-x={-Math.PI / 2} position-y={0.13} material={mats.ring}>
        <ringGeometry args={[ring * 0.86, ring, 64]} />
      </mesh>
      <mesh rotation-x={-Math.PI / 2} position-y={0.13} material={mats.ring}>
        <circleGeometry args={[BEAM_RADIUS * 1.6, 24]} />
      </mesh>
      <mesh ref={beamRef} material={mats.beam}>
        <cylinderGeometry args={[BEAM_RADIUS, BEAM_RADIUS, BEAM_HEIGHT, 16, 1, true]} />
      </mesh>
      {/* z-index 0 keeps the label under the HUD and panels, which come later in the page. */}
      <Html position={[0, BEAM_HEIGHT + 3, 0]} center zIndexRange={[0, 0]} style={{ pointerEvents: "none" }}>
        <div
          aria-hidden
          className={`flex select-none items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 text-xs font-semibold shadow-lg transition-transform duration-200 ${
            pin.own ? "border-violet-300/70 bg-violet-950/85 text-violet-100" : "border-amber-300/70 bg-amber-950/85 text-amber-100"
          } ${highlighted ? "scale-125" : ""}`}
        >
          {pin.letter}
          {best && <span className="font-normal text-amber-200">· best</span>}
        </div>
      </Html>
    </group>
  );
}

/** Lettered beacons on the spots being scouted. The highlighted one (a hovered card) glows brighter. */
export function ScoutPins({
  layout, pins, highlighted, best,
}: {
  layout: CityLayout;
  pins: ScoutPin[];
  /** Cell of the pin to highlight, or null. */
  highlighted: number | null;
  /** Cell of the top-ranked spot once results are in, or null. */
  best: number | null;
}) {
  return (
    <group>
      {pins.map((p) => (
        <Pin key={`${p.letter}:${p.cell}`} layout={layout} pin={p} highlighted={highlighted === p.cell} best={best === p.cell} />
      ))}
    </group>
  );
}
