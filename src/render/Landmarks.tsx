"use client";

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type CityLayout, LANDMARK_RADIUS, LANDMARK_SCALE } from "@/render/layout";
import { type Rgb, sceneHuesOf, sceneRgb } from "@/render/palette";
import { type VenueView, venueViewsOf } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { VenueKind, World } from "@/world/schema";

const BODY = "#151821";
const NEUTRAL_SIGN: Rgb = [0.9, 0.85, 0.75];
const CLOSED_SINK = -3.5;
/** The stadium is modelled with a 4.4-unit ring; it is drawn shrunk to LANDMARK_RADIUS.stadium so it fits a pad. */
const STADIUM_SHRINK = LANDMARK_RADIUS.stadium / 4.4;
/** Spring for the rise and sink: underdamped (ζ ≈ 0.5), so an opening landmark overshoots and settles. */
const STIFFNESS = 120;
const DAMPING = 11;
/** A freshly mounted open landmark starts this far (× its scale) below ground and springs up. */
const BURIED = -6;
const DYING_HEALTH = 0.15;
const BEACON_PERIOD_MS = 1500;
const BEACON_HZ = 1.2;

type Anim = { y: number; vy: number; last: number; open: boolean; openedAt: number; flicker: number };

/**
 * The neon parts share one material per landmark (`neon`), so the sign colour and its dying flicker
 * are set in one place, every animation frame.
 */
function Body({ kind, neon }: { kind: VenueKind; neon: THREE.Material }): ReactNode {
  const body = <meshStandardMaterial color={BODY} roughness={0.8} />;
  switch (kind) {
    case "club":
      return (
        <>
          <mesh position-y={1.2}><boxGeometry args={[3.2, 2.4, 3.2]} />{body}</mesh>
          <mesh position={[0, 2.0, 1.62]} material={neon}><boxGeometry args={[2.6, 0.3, 0.05]} /></mesh>
          <mesh position-y={2.45} material={neon}><boxGeometry args={[3.3, 0.08, 3.3]} /></mesh>
        </>
      );
    case "bar":
      return (
        <>
          <mesh position-y={0.8}><boxGeometry args={[2.6, 1.6, 2.4]} />{body}</mesh>
          <mesh position={[0, 1.25, 1.45]}><boxGeometry args={[2.8, 0.1, 0.8]} /><meshStandardMaterial color="#3a1f2b" /></mesh>
          <mesh position={[0, 1.45, 1.23]} material={neon}><boxGeometry args={[1.6, 0.28, 0.05]} /></mesh>
        </>
      );
    case "cafe":
      return (
        <>
          <mesh position-y={0.65}><cylinderGeometry args={[1.4, 1.4, 1.3, 20]} />{body}</mesh>
          <mesh position-y={1.75}><coneGeometry args={[1.7, 0.9, 20]} />{body}</mesh>
          <mesh position-y={1.3} rotation-x={Math.PI / 2} material={neon}><torusGeometry args={[1.45, 0.06, 8, 32]} /></mesh>
        </>
      );
    case "restaurant":
      return (
        <>
          <mesh position-y={0.75}><boxGeometry args={[3.2, 1.5, 2.4]} />{body}</mesh>
          <mesh position-y={2.1} rotation-y={Math.PI / 4}><coneGeometry args={[2.4, 1.2, 4]} />{body}</mesh>
          <mesh position={[0, 1.2, 1.23]} material={neon}><boxGeometry args={[1.8, 0.3, 0.05]} /></mesh>
        </>
      );
    case "gallery":
      return (
        <>
          <mesh position-y={1.3}><boxGeometry args={[3, 2.6, 3]} /><meshStandardMaterial color="#2a2d36" roughness={0.6} /></mesh>
          <mesh position-y={0.05} material={neon}><boxGeometry args={[3.1, 0.06, 3.1]} /></mesh>
        </>
      );
    case "music_venue":
      return (
        <>
          <mesh rotation-z={Math.PI / 2}><cylinderGeometry args={[2, 2, 5, 20]} />{body}</mesh>
          <mesh position={[0, 1.1, 2.02]} material={neon}><boxGeometry args={[3, 0.5, 0.05]} /></mesh>
        </>
      );
    case "shop":
      return (
        <>
          <mesh position-y={0.7}><boxGeometry args={[1.8, 1.4, 1.8]} />{body}</mesh>
          <mesh position={[0, 1.15, 0.93]} material={neon}><boxGeometry args={[1.2, 0.22, 0.05]} /></mesh>
        </>
      );
    case "stadium":
      return (
        <group scale={STADIUM_SHRINK}>
          <mesh position-y={0.8} rotation-x={Math.PI / 2}><torusGeometry args={[3.4, 1, 10, 32]} />{body}</mesh>
          <mesh position-y={1.6} rotation-x={Math.PI / 2} material={neon}><torusGeometry args={[4.2, 0.08, 8, 48]} /></mesh>
        </group>
      );
    default:
      return (
        <>
          <mesh position-y={1.1}><boxGeometry args={[2.2, 2.2, 2.2]} />{body}</mesh>
          <mesh position={[0, 1.8, 1.12]} material={neon}><boxGeometry args={[1.4, 0.26, 0.05]} /></mesh>
        </>
      );
  }
}

function Landmark({ view, hues, selected, onSelect }: { view: VenueView; hues: Float32Array; selected: boolean; onSelect: (slot: number) => void }) {
  const [x, z] = view.position;
  const [r, g, b] = view.dominantScene >= 0 ? sceneRgb(hues, view.dominantScene) : NEUTRAL_SIGN;
  const glow = view.open ? 0.5 + 2.2 * view.health : 0.04;
  const sign: Rgb = [r * glow, g * glow, b * glow];
  const pillar = (24 * LANDMARK_SCALE) / view.scale;
  const beacon = view.isEvent && view.open;
  const neon = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const bodyRef = useRef<THREE.Group>(null);
  const pillarRef = useRef<THREE.MeshBasicMaterial>(null);
  const waveRef = useRef<THREE.Mesh>(null);
  const waveMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const anim = useRef<Anim | null>(null);

  useEffect(() => () => neon.dispose(), [neon]);

  useFrame(() => {
    const now = performance.now();
    let a = anim.current;
    if (!a) {
      a = { y: view.open ? BURIED * view.scale : CLOSED_SINK, vy: 0, last: now, open: view.open, openedAt: view.open ? now : -Infinity, flicker: 1 };
      anim.current = a;
    }
    if (view.open && !a.open) a.openedAt = now;
    a.open = view.open;
    const dt = Math.min(1 / 30, Math.max(0, (now - a.last) / 1000));
    a.last = now;

    // Rise and sink.
    const target = view.open ? 0 : CLOSED_SINK;
    a.vy += (STIFFNESS * (target - a.y) - DAMPING * a.vy) * dt;
    a.y += a.vy * dt;
    const group = bodyRef.current;
    if (group) {
      group.position.y = a.y;
      const since = now - a.openedAt;
      group.scale.setScalar(view.scale * (since < 1500 ? 1 + 0.25 * Math.exp(-since / 250) : 1));
    }

    // Sign colour, with a stuttering flicker while the venue is dying.
    let flickerTarget = 1;
    if (view.open && view.health < DYING_HEALTH) {
      // Hash noise held for 80 ms at a time, so the stutter reads as a flicker rather than a buzz.
      const n = Math.sin(Math.floor(now / 80) * 1.04 + view.slot) * 43758;
      flickerTarget = n - Math.floor(n) >= 0.5 ? 1 : 0.35;
    }
    a.flicker += (flickerTarget - a.flicker) * (1 - Math.exp(-dt / 0.04));
    neon.color.setRGB(sign[0] * a.flicker, sign[1] * a.flicker, sign[2] * a.flicker);

    // Event beacon: a pulsing pillar and a ground ring that expands and fades every BEACON_PERIOD_MS.
    if (pillarRef.current) {
      pillarRef.current.opacity = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin((now / 1000) * BEACON_HZ * Math.PI * 2));
    }
    if (waveRef.current && waveMatRef.current) {
      const phase = (now % BEACON_PERIOD_MS) / BEACON_PERIOD_MS;
      waveRef.current.scale.setScalar(1 + 7 * phase);
      waveMatRef.current.opacity = (1 - phase) * (1 - phase);
    }
  });

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(view.slot);
  };
  return (
    <group position={[x, 0, z]} onClick={onClick}>
      {/* Springs in height and pops in scale (see useFrame); starts below ground until the first frame. */}
      <group ref={bodyRef} position-y={BURIED * view.scale} scale={view.scale}>
        <Body kind={view.kind} neon={neon} />
      </group>
      <group scale={view.scale}>
        {beacon && (
          <>
            {/* The pillar keeps its full-scale height on shrunken pads. */}
            <mesh position-y={pillar / 2}>
              <cylinderGeometry args={[0.9, 0.9, pillar, 16, 1, true]} />
              <meshBasicMaterial
                ref={pillarRef}
                color={sign}
                toneMapped={false}
                transparent
                opacity={0.3}
                depthWrite={false}
                blending={THREE.AdditiveBlending}
                side={THREE.DoubleSide}
              />
            </mesh>
            <mesh ref={waveRef} rotation-x={-Math.PI / 2} position-y={0.1}>
              <ringGeometry args={[0.85, 1, 48]} />
              <meshBasicMaterial
                ref={waveMatRef}
                color={sign}
                toneMapped={false}
                transparent
                depthWrite={false}
                blending={THREE.AdditiveBlending}
              />
            </mesh>
          </>
        )}
        {selected && (
          <mesh rotation-x={-Math.PI / 2} position-y={0.06}>
            <ringGeometry args={[3.6, 4.1, 48]} />
            <meshBasicMaterial color={[2, 2, 2]} toneMapped={false} />
          </mesh>
        )}
      </group>
    </group>
  );
}

export function Landmarks({
  world, layout, frame, selected, onSelect,
}: {
  world: World;
  layout: CityLayout;
  frame: Frame | null;
  selected: number | null;
  onSelect: (slot: number) => void;
}) {
  const views = useMemo(() => (frame ? venueViewsOf(frame, layout, world) : []), [frame, layout, world]);
  const hues = useMemo(() => (frame ? sceneHuesOf(frame.lineageParents) : new Float32Array(0)), [frame]);
  return (
    <group>
      {views.map((v) => (
        <Landmark key={v.slot} view={v} hues={hues} selected={selected === v.slot} onSelect={onSelect} />
      ))}
    </group>
  );
}
