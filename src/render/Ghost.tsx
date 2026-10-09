"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { FrameStore } from "@/render/frame-store";
import type { GroundPointer } from "@/render/Ground";
import { Body, type Materials } from "@/render/Landmarks";
import { type CityLayout, LANDMARK_RADIUS, LANDMARK_SCALE, landmarkPosition, landmarkScale, nearestCell } from "@/render/layout";
import type { VenueKind } from "@/world/schema";

/** What is being placed: a venue of a kind, or an event (drawn as a beacon). */
export type GhostSpec = { kind: "venue"; venueKind: VenueKind } | { kind: "event" };

const GHOST_RGB = new THREE.Color(0.75, 0.7, 1);
const CELL_RGB = new THREE.Color(1, 0.8, 0.35);
const PULSE_HZ = 1.1;
/** Time constant (s) of the ghost's glide to the pad it will open on. */
const GLIDE_S = 0.08;
const BEACON_HEIGHT = 40;

/**
 * Translucent, pulsing preview of a placement. A small ring follows the cursor; the ghost itself sits
 * on the pad the new venue will actually take in the cell under the cursor, and a ring outlines that
 * cell, so the player sees where the click will put it.
 */
export function Ghost({
  layout, frames, pointerRef, spec,
}: {
  layout: CityLayout;
  frames: RefObject<FrameStore>;
  pointerRef: RefObject<GroundPointer>;
  spec: GhostSpec;
}) {
  const rootRef = useRef<THREE.Group>(null);
  const cursorRef = useRef<THREE.Mesh>(null);
  const cellRef = useRef<THREE.Mesh>(null);
  const ghostRef = useRef<THREE.Group>(null);
  const glide = useRef<{ x: number; z: number; last: number; placed: boolean }>({ x: 0, z: 0, last: 0, placed: false });
  const mats = useMemo(
    () => ({
      venue: {
        neon: new THREE.MeshBasicMaterial({ color: GHOST_RGB, toneMapped: false, transparent: true, depthWrite: false }),
        body: new THREE.MeshStandardMaterial({ color: "#1a1d2a", emissive: GHOST_RGB, emissiveIntensity: 0.35, transparent: true, depthWrite: false }),
        band: new THREE.MeshBasicMaterial({ color: GHOST_RGB, toneMapped: false, transparent: true, depthWrite: false }),
      } satisfies Materials,
      ring: new THREE.MeshBasicMaterial({ color: GHOST_RGB, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      cell: new THREE.MeshBasicMaterial({ color: CELL_RGB, toneMapped: false, transparent: true, depthWrite: false, side: THREE.DoubleSide }),
      beacon: new THREE.MeshBasicMaterial({
        color: GHOST_RGB, toneMapped: false, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      }),
    }),
    [],
  );
  useEffect(
    () => () => {
      mats.venue.neon.dispose();
      mats.venue.body.dispose();
      mats.venue.band.dispose();
      mats.ring.dispose();
      mats.cell.dispose();
      mats.beacon.dispose();
    },
    [mats],
  );

  useFrame(() => {
    const root = rootRef.current;
    const pointer = pointerRef.current;
    if (!root) return;
    root.visible = pointer.over;
    if (!pointer.over) return;
    const now = performance.now();
    const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * PULSE_HZ * Math.PI * 2);

    const cell = nearestCell(layout, pointer.x, pointer.z);
    // A new venue takes the next pad of its cell (venues share a cell's pads in slot order).
    const frame = frames.current.current;
    let pad = 0;
    if (frame) for (let v = 0; v < frame.nVenues; v++) if (frame.venueCell[v] === cell) pad++;
    const [px, pz] = landmarkPosition(layout, cell, pad);
    const scale = landmarkScale(layout, cell, pad);

    const g = glide.current;
    const dt = Math.min(0.1, Math.max(0, (now - g.last) / 1000));
    g.last = now;
    if (!g.placed) {
      g.x = px;
      g.z = pz;
      g.placed = true;
    }
    const k = 1 - Math.exp(-dt / GLIDE_S);
    g.x += (px - g.x) * k;
    g.z += (pz - g.z) * k;

    cursorRef.current?.position.set(pointer.x, 0.15, pointer.z);
    if (cellRef.current) {
      cellRef.current.position.set(layout.cellX[cell], 0.12, layout.cellZ[cell]);
      cellRef.current.scale.setScalar(layout.spacing * 0.55);
    }
    if (ghostRef.current) {
      ghostRef.current.position.set(g.x, 0, g.z);
      ghostRef.current.scale.setScalar(scale);
    }
    // Opacity goes through setValues: hook values are changed through methods, never reassigned.
    mats.venue.neon.setValues({ opacity: 0.5 + 0.4 * pulse });
    mats.venue.band.setValues({ opacity: 0.4 + 0.4 * pulse });
    mats.venue.body.setValues({ opacity: 0.25 + 0.2 * pulse });
    mats.ring.setValues({ opacity: 0.5 + 0.4 * pulse });
    mats.cell.setValues({ opacity: 0.25 + 0.25 * pulse });
    mats.beacon.setValues({ opacity: 0.12 + 0.18 * pulse });
  });

  const footprint = spec.kind === "venue" ? LANDMARK_RADIUS[spec.venueKind] + 0.4 : 1.6;
  const beaconHeight = (BEACON_HEIGHT * LANDMARK_SCALE) / 2;
  return (
    <group ref={rootRef} visible={false}>
      <mesh ref={cursorRef} rotation-x={-Math.PI / 2} material={mats.ring}>
        <ringGeometry args={[1.1, 1.5, 32]} />
      </mesh>
      <mesh ref={cellRef} rotation-x={-Math.PI / 2} material={mats.cell}>
        <ringGeometry args={[0.97, 1, 96]} />
      </mesh>
      <group ref={ghostRef}>
        <mesh rotation-x={-Math.PI / 2} position-y={0.1} material={mats.ring}>
          <ringGeometry args={[footprint, footprint + 0.25, 48]} />
        </mesh>
        {spec.kind === "venue" ? (
          <Body kind={spec.venueKind} mats={mats.venue} />
        ) : (
          <mesh position-y={beaconHeight / 2} material={mats.beacon}>
            <cylinderGeometry args={[0.9, 0.9, beaconHeight, 16, 1, true]} />
          </mesh>
        )}
      </group>
    </group>
  );
}
