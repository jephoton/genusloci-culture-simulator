"use client";

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { type ReactNode, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type Focus, venueInFocus } from "@/render/focus";
import { type CityLayout, LANDMARK_RADIUS, LANDMARK_SCALE } from "@/render/layout";
import { type Rgb, sceneHuesOf, sceneRgb, WARNING_RGB } from "@/render/palette";
import { type ClosureRules, isStruggling, type VenueView, venueViewsOf } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { VenueKind, World } from "@/world/schema";

const BODY = "#151821";
const GALLERY_BODY = "#2a2d36";
/** Sign colour of a venue with no dominant scene: a neutral warm white. */
const NEUTRAL_SIGN: Rgb = [0.9, 0.85, 0.75];
/** Bodies glow faintly in the sign colour, so every landmark reads as a lit object. */
const BODY_EMISSIVE = 0.18;
/** Strength of the lit band near the roofline, relative to the sign colour. */
const BAND = 0.6;
/** Closed venues keep this fraction of their body and band light: dim, but visible. */
const CLOSED_LIT = 0.15;
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
/** Under a focus, venues outside it keep this fraction of their light. */
const UNFOCUSED_LIT = 0.3;
/**
 * Struggling venues (health under the closure threshold) pulse red at WARN_HZ: the sign and band are
 * pulled towards red by WARN_TINT_MIN…WARN_TINT_MAX of the way, and a red ring breathes on the ground.
 * The dying flicker still modulates brightness on top, so a venue about to close stutters in red.
 */
const WARN_HZ = 0.5;
const WARN_TINT_MIN = 0.35;
const WARN_TINT_MAX = 0.85;
/** Ring opacity range over a pulse. */
const WARN_RING_MIN = 0.15;
const WARN_RING_MAX = 0.7;
/** Time constant of the fade into and out of the warning. */
const WARN_S = 0.4;

type Anim = {
  y: number; vy: number; last: number; open: boolean; openedAt: number; flicker: number; lit: number; focus: number;
  /** Warning envelope in [0, 1]: 1 while struggling. */
  warn: number;
};

/** Per-landmark materials, recoloured every animation frame. */
export type Materials = { neon: THREE.MeshBasicMaterial; body: THREE.MeshStandardMaterial; band: THREE.MeshBasicMaterial };

/**
 * The neon parts share one material per landmark (`neon`), so the sign colour and its dying flicker
 * are set in one place. The body glows faintly in the sign colour (`body`), and a thin lit band runs
 * just under the roofline (`band`).
 */
export function Body({ kind, mats: { neon, body, band } }: { kind: VenueKind; mats: Materials }): ReactNode {
  switch (kind) {
    case "club":
      return (
        <>
          <mesh position-y={1.2} material={body}><boxGeometry args={[3.2, 2.4, 3.2]} /></mesh>
          <mesh position-y={2.15} material={band}><boxGeometry args={[3.24, 0.1, 3.24]} /></mesh>
          <mesh position={[0, 2.0, 1.62]} material={neon}><boxGeometry args={[2.6, 0.3, 0.05]} /></mesh>
          <mesh position-y={2.45} material={neon}><boxGeometry args={[3.3, 0.08, 3.3]} /></mesh>
        </>
      );
    case "bar":
      return (
        <>
          <mesh position-y={0.8} material={body}><boxGeometry args={[2.6, 1.6, 2.4]} /></mesh>
          <mesh position-y={1.52} material={band}><boxGeometry args={[2.64, 0.08, 2.44]} /></mesh>
          <mesh position={[0, 1.25, 1.45]}><boxGeometry args={[2.8, 0.1, 0.8]} /><meshStandardMaterial color="#3a1f2b" /></mesh>
          <mesh position={[0, 1.45, 1.23]} material={neon}><boxGeometry args={[1.6, 0.28, 0.05]} /></mesh>
        </>
      );
    case "cafe":
      return (
        <>
          <mesh position-y={0.65} material={body}><cylinderGeometry args={[1.4, 1.4, 1.3, 20]} /></mesh>
          <mesh position-y={1.75} material={body}><coneGeometry args={[1.7, 0.9, 20]} /></mesh>
          <mesh position-y={1.12} material={band}><cylinderGeometry args={[1.42, 1.42, 0.08, 20, 1, true]} /></mesh>
          <mesh position-y={1.3} rotation-x={Math.PI / 2} material={neon}><torusGeometry args={[1.45, 0.06, 8, 32]} /></mesh>
        </>
      );
    case "restaurant":
      return (
        <>
          <mesh position-y={0.75} material={body}><boxGeometry args={[3.2, 1.5, 2.4]} /></mesh>
          <mesh position-y={2.1} rotation-y={Math.PI / 4} material={body}><coneGeometry args={[2.4, 1.2, 4]} /></mesh>
          <mesh position-y={1.42} material={band}><boxGeometry args={[3.24, 0.08, 2.44]} /></mesh>
          <mesh position={[0, 1.2, 1.23]} material={neon}><boxGeometry args={[1.8, 0.3, 0.05]} /></mesh>
        </>
      );
    case "gallery":
      return (
        <>
          <mesh position-y={1.3} material={body}><boxGeometry args={[3, 2.6, 3]} /></mesh>
          <mesh position-y={2.45} material={band}><boxGeometry args={[3.04, 0.1, 3.04]} /></mesh>
          <mesh position-y={0.05} material={neon}><boxGeometry args={[3.1, 0.06, 3.1]} /></mesh>
        </>
      );
    case "music_venue":
      return (
        <>
          <mesh rotation-z={Math.PI / 2} material={body}><cylinderGeometry args={[2, 2, 5, 20]} /></mesh>
          <mesh position-y={1.99} material={band}><boxGeometry args={[5.02, 0.06, 0.3]} /></mesh>
          <mesh position={[0, 1.1, 2.02]} material={neon}><boxGeometry args={[3, 0.5, 0.05]} /></mesh>
        </>
      );
    case "shop":
      return (
        <>
          <mesh position-y={0.7} material={body}><boxGeometry args={[1.8, 1.4, 1.8]} /></mesh>
          <mesh position-y={1.32} material={band}><boxGeometry args={[1.84, 0.08, 1.84]} /></mesh>
          <mesh position={[0, 1.15, 0.93]} material={neon}><boxGeometry args={[1.2, 0.22, 0.05]} /></mesh>
        </>
      );
    case "stadium":
      return (
        <group scale={STADIUM_SHRINK}>
          <mesh position-y={0.8} rotation-x={Math.PI / 2} material={body}><torusGeometry args={[3.4, 1, 10, 32]} /></mesh>
          <mesh position-y={1.78} rotation-x={Math.PI / 2} material={band}><torusGeometry args={[3.4, 0.08, 6, 48]} /></mesh>
          <mesh position-y={1.6} rotation-x={Math.PI / 2} material={neon}><torusGeometry args={[4.2, 0.08, 8, 48]} /></mesh>
        </group>
      );
    default:
      return (
        <>
          <mesh position-y={1.1} material={body}><boxGeometry args={[2.2, 2.2, 2.2]} /></mesh>
          <mesh position-y={2.05} material={band}><boxGeometry args={[2.24, 0.08, 2.24]} /></mesh>
          <mesh position={[0, 1.8, 1.12]} material={neon}><boxGeometry args={[1.4, 0.26, 0.05]} /></mesh>
        </>
      );
  }
}

function Landmark({
  view, hues, selected, inFocus, struggling, onSelect,
}: {
  view: VenueView;
  hues: Float32Array;
  selected: boolean;
  /** On the path to closing (see isStruggling): shows the red warning pulse. */
  struggling: boolean;
  /** False when a focus is active and this venue is outside it: it dims. */
  inFocus: boolean;
  onSelect: (slot: number) => void;
}) {
  const [x, z] = view.position;
  const base = view.dominantScene >= 0 ? sceneRgb(hues, view.dominantScene) : NEUTRAL_SIGN;
  const [r, g, b] = base;
  const glow = view.open ? 0.5 + 2.2 * view.health : 0.04;
  const sign: Rgb = [r * glow, g * glow, b * glow];
  const pillar = (24 * LANDMARK_SCALE) / view.scale;
  const beacon = view.isEvent && view.open;
  const gallery = view.kind === "gallery";
  const mats = useMemo<Materials>(
    () => ({
      neon: new THREE.MeshBasicMaterial({ toneMapped: false }),
      body: new THREE.MeshStandardMaterial({ color: gallery ? GALLERY_BODY : BODY, roughness: gallery ? 0.6 : 0.8, emissiveIntensity: 1 }),
      band: new THREE.MeshBasicMaterial({ toneMapped: false }),
    }),
    [gallery],
  );
  const bodyRef = useRef<THREE.Group>(null);
  const pillarRef = useRef<THREE.MeshBasicMaterial>(null);
  const waveRef = useRef<THREE.Mesh>(null);
  const waveMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const warnRef = useRef<THREE.Mesh>(null);
  const warnMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const anim = useRef<Anim | null>(null);

  useEffect(
    () => () => {
      mats.neon.dispose();
      mats.body.dispose();
      mats.band.dispose();
    },
    [mats],
  );

  useFrame(() => {
    const now = performance.now();
    let a = anim.current;
    if (!a) {
      a = {
        y: view.open ? BURIED * view.scale : CLOSED_SINK,
        vy: 0,
        last: now,
        open: view.open,
        openedAt: view.open ? now : -Infinity,
        flicker: 1,
        lit: view.open ? 1 : CLOSED_LIT,
        focus: inFocus ? 1 : UNFOCUSED_LIT,
        warn: struggling ? 1 : 0,
      };
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
    a.focus += ((inFocus ? 1 : UNFOCUSED_LIT) - a.focus) * (1 - Math.exp(-dt / 0.2));
    // Struggling: pull the sign and band towards warning red, pulsing slowly.
    a.warn += ((struggling ? 1 : 0) - a.warn) * (1 - Math.exp(-dt / WARN_S));
    const pulse = 0.5 + 0.5 * Math.sin((now / 1000) * WARN_HZ * Math.PI * 2);
    const red = a.warn * (WARN_TINT_MIN + (WARN_TINT_MAX - WARN_TINT_MIN) * pulse);
    // Red at no less than full brightness, so a dim (struggling) sign still reads as a warning.
    const redLevel = Math.max(1, glow);
    const neon = a.flicker * a.focus;
    mats.neon.color.setRGB(
      (sign[0] + (WARNING_RGB[0] * redLevel - sign[0]) * red) * neon,
      (sign[1] + (WARNING_RGB[1] * redLevel - sign[1]) * red) * neon,
      (sign[2] + (WARNING_RGB[2] * redLevel - sign[2]) * red) * neon,
    );

    // Body glow and roofline band in the sign colour; closing dims them smoothly, never to black.
    a.lit += ((view.open ? 1 : CLOSED_LIT) - a.lit) * (1 - Math.exp(-dt / 0.3));
    const glowBody = BODY_EMISSIVE * a.lit * a.focus;
    mats.body.emissive.setRGB(base[0] * glowBody, base[1] * glowBody, base[2] * glowBody);
    const glowBand = BAND * a.lit * a.flicker * a.focus;
    mats.band.color.setRGB(
      (base[0] + (WARNING_RGB[0] - base[0]) * red) * glowBand,
      (base[1] + (WARNING_RGB[1] - base[1]) * red) * glowBand,
      (base[2] + (WARNING_RGB[2] - base[2]) * red) * glowBand,
    );
    if (warnRef.current && warnMatRef.current) {
      warnRef.current.visible = a.warn > 0.01;
      warnRef.current.scale.setScalar(1 + 0.08 * pulse);
      warnMatRef.current.opacity = a.warn * (WARN_RING_MIN + (WARN_RING_MAX - WARN_RING_MIN) * pulse) * a.focus;
    }

    // Event beacon: a pulsing pillar and a ground ring that expands and fades every BEACON_PERIOD_MS.
    if (pillarRef.current) {
      pillarRef.current.opacity = (0.18 + 0.22 * (0.5 + 0.5 * Math.sin((now / 1000) * BEACON_HZ * Math.PI * 2))) * a.focus;
    }
    if (waveRef.current && waveMatRef.current) {
      const phase = (now % BEACON_PERIOD_MS) / BEACON_PERIOD_MS;
      waveRef.current.scale.setScalar(1 + 7 * phase);
      waveMatRef.current.opacity = (1 - phase) * (1 - phase) * a.focus;
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
        <Body kind={view.kind} mats={mats} />
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
        {/* Struggling warning: a red ring that breathes with the sign's pulse (see useFrame). */}
        <mesh ref={warnRef} rotation-x={-Math.PI / 2} position-y={0.08} visible={false}>
          <ringGeometry args={[4.4, 4.85, 48]} />
          <meshBasicMaterial
            ref={warnMatRef}
            color={WARNING_RGB}
            toneMapped={false}
            transparent
            opacity={0}
            depthWrite={false}
            blending={THREE.AdditiveBlending}
          />
        </mesh>
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
  world, layout, frame, selected, focus, rules, onSelect,
}: {
  world: World;
  layout: CityLayout;
  frame: Frame | null;
  /** The sim's closure rules, to tell which venues are struggling. */
  rules: ClosureRules;
  selected: number | null;
  focus: Focus;
  onSelect: (slot: number) => void;
}) {
  const views = useMemo(() => (frame ? venueViewsOf(frame, layout, world) : []), [frame, layout, world]);
  const hues = useMemo(() => (frame ? sceneHuesOf(frame.lineageParents) : new Float32Array(0)), [frame]);
  return (
    <group>
      {views.map((v) => (
        <Landmark key={v.slot} view={v} hues={hues} selected={selected === v.slot} inFocus={venueInFocus(focus, v)} struggling={frame ? isStruggling(frame, v.slot, rules) : false} onSelect={onSelect} />
      ))}
    </group>
  );
}
