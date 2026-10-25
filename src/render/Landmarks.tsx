"use client";

import { type ThreeEvent, useFrame } from "@react-three/fiber";
import { type ReactNode, type RefObject, useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { type Focus, RACE_RGB, venueInFocus } from "@/render/focus";
import type { FrameStore } from "@/render/frame-store";
import { type CityLayout, LANDMARK_RADIUS, LANDMARK_SCALE } from "@/render/layout";
import { type Rgb, sceneHuesOf, sceneRgb, WARNING_RGB } from "@/render/palette";
import { type ClosureRules, isStruggling, type VenueView, venueViewsOf } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { VenueKind, World } from "@/world/schema";
import { gableGeometry } from "@/render/architecture";
import { venueBeaconScene, canInspectVenue } from "@/render/case-view";

const PAINT: Record<VenueKind, string> = { club: "#599ba1", bar: "#bc796a", cafe: "#dbbc7d", restaurant: "#c98e73", gallery: "#d2c9b1", music_venue: "#b78497", shop: "#76a79a", stadium: "#96abb3", other: "#bda48b" };
const ROOFS: Record<VenueKind, string> = { club: "#375b72", bar: "#725165", cafe: "#a85b47", restaurant: "#934f48", gallery: "#62868b", music_venue: "#624b6d", shop: "#496d78", stadium: "#536c7e", other: "#705966" };
const PAINT_COLOURS = Object.fromEntries(Object.entries(PAINT).map(([kind, colour]) => [kind, new THREE.Color(colour)])) as Record<VenueKind, THREE.Color>;
const ROOF_COLOURS = Object.fromEntries(Object.entries(ROOFS).map(([kind, colour]) => [kind, new THREE.Color(colour)])) as Record<VenueKind, THREE.Color>;
const TRIM_COLOUR = new THREE.Color("#ead8af");
/** Sign colour of a venue with no dominant scene (and body colour of one with no identity): a neutral warm white. */
const NEUTRAL_SIGN: Rgb = [0.9, 0.85, 0.75];
/** Bodies glow faintly in their identity colour, so every landmark reads as a lit object. */
const BODY_EMISSIVE = 0.18;
/** Strength of the lit band near the roofline, relative to the identity colour. */
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
const UNFOCUSED_LIT = 0.06;
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
  /** `last` is animation clock time (pausable); `lastReal` real time, for the focus fade. */
  y: number; vy: number; last: number; lastReal: number; open: boolean; openedAt: number; flicker: number; lit: number; focus: number;
  /** Warning envelope in [0, 1]: 1 while struggling. */
  warn: number;
  /** Frame epoch last drawn: a change (rewind, re-init) jumps straight to the new state. */
  epoch: number;
};

/** Per-landmark materials, recoloured every animation frame. */
export type Materials = { neon: THREE.MeshBasicMaterial; body: THREE.MeshStandardMaterial; band: THREE.MeshBasicMaterial; roof?: THREE.MeshStandardMaterial; window?: THREE.MeshBasicMaterial; trim?: THREE.MeshStandardMaterial };

function PitchedRoof({ position, size, material }: { position: [number, number, number]; size: [number, number, number]; material: THREE.Material }) {
  const geometry = useMemo(() => gableGeometry(), []);
  useEffect(() => () => geometry.dispose(), [geometry]);
  return <mesh geometry={geometry} position={position} scale={size} material={material} />;
}

/**
 * The neon parts share one material per landmark (`neon`), so the sign colour and its dying flicker
 * are set in one place. The body glows faintly (`body`), and a thin lit band runs just under the
 * roofline (`band`), both in the venue's identity colour (see Landmark).
 */
export function Body({ kind, mats: { neon, body, band, roof = body, window = band, trim = body } }: { kind: VenueKind; mats: Materials }): ReactNode {
  switch (kind) {
    case "club":
      return (
        <>
          <mesh position-y={0.95} material={body}><boxGeometry args={[3, 1.9, 2.6]} /></mesh>
          <mesh position-y={1.95} material={trim}><boxGeometry args={[3.2, 0.18, 2.8]} /></mesh>
          <mesh position={[0, 2.3, -0.25]} material={body}><cylinderGeometry args={[1.05, 1.05, 0.7, 8]} /></mesh>
          <mesh position={[0, 2.9, -0.25]} material={roof}><coneGeometry args={[1.35, 0.65, 8]} /></mesh>
          <mesh position={[0, 0.65, 1.42]} material={roof}><boxGeometry args={[0.85, 1.3, 0.06]} /></mesh>
          <mesh position={[0, 1.65, 1.52]} material={neon}><torusGeometry args={[0.42, 0.09, 6, 16]} /></mesh>
          <mesh position={[0, 1.4, 1.58]} material={roof}><boxGeometry args={[1.85, 0.16, 0.4]} /></mesh>
          {[-1.05, 1.05].map((x) => <mesh key={x} position={[x, 0.8, 1.43]} material={band}><boxGeometry args={[0.1, 1.25, 0.05]} /></mesh>)}
        </>
      );
    case "bar":
      return (
        <>
          <mesh position-y={1} material={body}><boxGeometry args={[2.6, 2, 2.1]} /></mesh>
          <PitchedRoof position={[0, 2, 0]} size={[3, 1.05, 2.45]} material={roof} />
          <mesh position={[0, 1.9, 1.1]} material={trim}><boxGeometry args={[2.7, 0.15, 0.12]} /></mesh>
          <mesh position={[0.9, 2.7, -0.4]} material={body}><boxGeometry args={[0.28, 0.8, 0.32]} /></mesh>
          <mesh position={[0, 0.55, 1.07]} material={roof}><boxGeometry args={[0.5, 1.1, 0.08]} /></mesh>
          {[-0.82, 0.82].map((x) => <mesh key={x} position={[x, 0.7, 1.08]} material={window}><boxGeometry args={[0.7, 0.8, 0.05]} /></mesh>)}
          <mesh position={[0, 1.35, 1.11]} material={band}><boxGeometry args={[2.65, 0.18, 0.12]} /></mesh>
          <mesh position={[0.9, 1.85, 1.35]} material={neon}><boxGeometry args={[0.5, 0.48, 0.12]} /></mesh>
        </>
      );
    case "cafe":
      return (
        <>
          <mesh position-y={0.75} material={body}><boxGeometry args={[1.8, 1.5, 1.6]} /></mesh>
          <PitchedRoof position={[0, 1.5, 0]} size={[2.1, 0.85, 2]} material={roof} />
          <mesh position={[-0.3, 0.75, 0.92]} material={window}><boxGeometry args={[0.8, 0.9, 0.04]} /></mesh>
          <mesh position={[0.5, 0.6, 0.92]} material={roof}><boxGeometry args={[0.42, 1.2, 0.05]} /></mesh>
          {[-0.84, -0.42, 0, 0.42, 0.84].map((x, i) => <mesh key={x} position={[x, 1.22, 1.02]} rotation-x={0.2} material={i % 2 === 0 ? trim : roof}><boxGeometry args={[0.42, 0.17, 0.5]} /></mesh>)}
          <mesh position={[0, 1.65, 1.04]} material={neon}><boxGeometry args={[0.65, 0.2, 0.05]} /></mesh>
        </>
      );
    case "restaurant":
      return (
        <>
          <mesh position-y={0.75} material={body}><boxGeometry args={[3.2, 1.5, 2.4]} /></mesh>
          <PitchedRoof position={[0, 1.5, 0]} size={[3.4, 1.25, 2.6]} material={roof} />
          <mesh position-y={1.48} material={trim}><boxGeometry args={[3.4, 0.15, 2.6]} /></mesh>
          {[-0.9, 0.9].map((x) => <mesh key={x} position={[x, 0.65, 1.23]} material={window}><boxGeometry args={[0.65, 0.75, 0.06]} /></mesh>)}
          <mesh position={[0, 1.2, 1.23]} material={neon}><boxGeometry args={[1.8, 0.3, 0.05]} /></mesh>
        </>
      );
    case "gallery":
      return (
        <>
          <mesh position-y={0.95} material={body}><boxGeometry args={[2.8, 1.9, 2.6]} /></mesh>
          <PitchedRoof position={[0, 1.9, 0]} size={[3.1, 0.75, 2.9]} material={roof} />
          <mesh position={[0, 1.5, 1.4]} material={trim}><boxGeometry args={[2.9, 0.25, 0.45]} /></mesh>
          {[-1, 0, 1].map((x) => <mesh key={x} position={[x, 0.75, 1.45]} material={trim}><cylinderGeometry args={[0.15, 0.2, 1.5, 6]} /></mesh>)}
          <mesh position={[0, 1.65, 1.66]} material={neon}><boxGeometry args={[1.3, 0.12, 0.05]} /></mesh>
        </>
      );
    case "music_venue":
      return (
        <>
          <mesh position-y={1} material={body}><boxGeometry args={[4.6, 2, 3.4]} /></mesh>
          <PitchedRoof position={[0, 2, 0]} size={[4.8, 1.1, 3.6]} material={roof} />
          <mesh position={[0, 2.3, 1.75]} material={body}><boxGeometry args={[2.6, 0.7, 0.5]} /></mesh>
          {[-1.85, 1.85].map((x) => <mesh key={x} position={[x, 1.15, 1.76]} material={trim}><boxGeometry args={[0.3, 2.3, 0.3]} /></mesh>)}
          {[-0.6, 0.6].map((x) => <mesh key={x} position={[x, 0.65, 1.72]} material={window}><boxGeometry args={[0.85, 1.3, 0.05]} /></mesh>)}
          <mesh position={[0, 1.65, 1.95]} material={trim}><boxGeometry args={[3.4, 0.35, 0.7]} /></mesh>
          <mesh position={[0, 1.7, 2.32]} material={neon}><boxGeometry args={[2.9, 0.23, 0.05]} /></mesh>
          {[-1.3, -0.65, 0, 0.65, 1.3].map((x) => <mesh key={x} position={[x, 1.45, 2.22]} material={band}><sphereGeometry args={[0.055, 6, 4]} /></mesh>)}
        </>
      );
    case "shop":
      return (
        <>
          <mesh position-y={0.7} material={body}><boxGeometry args={[1.8, 1.4, 1.8]} /></mesh>
          <PitchedRoof position={[0, 1.4, 0]} size={[1.8, 0.9, 1.8]} material={roof} />
          <mesh position={[-0.4, 0.65, 0.92]} material={window}><boxGeometry args={[0.6, 0.9, 0.04]} /></mesh>
          <mesh position={[0, 1.15, 0.93]} material={neon}><boxGeometry args={[1.2, 0.22, 0.05]} /></mesh>
        </>
      );
    case "stadium":
      return (
        <group scale={STADIUM_SHRINK}>
          <mesh position-y={0.8} rotation-x={Math.PI / 2} material={body}><torusGeometry args={[3.4, 1, 10, 32]} /></mesh>
          <mesh position-y={1.78} rotation-x={Math.PI / 2} material={band}><torusGeometry args={[3.4, 0.08, 6, 48]} /></mesh>
          <mesh position-y={1.6} rotation-x={Math.PI / 2} material={neon}><torusGeometry args={[4.2, 0.08, 8, 48]} /></mesh>
          <mesh position-y={0.05} rotation-x={-Math.PI / 2} material={roof}><circleGeometry args={[3.2, 24]} /></mesh>
        </group>
      );
    default:
      return (
        <>
          <mesh position-y={0.9} material={body}><boxGeometry args={[2, 1.8, 2]} /></mesh>
          <PitchedRoof position={[0, 1.8, 0]} size={[2.2, 1.2, 2.2]} material={roof} />
          <mesh position={[0, 0.65, 1.02]} material={window}><boxGeometry args={[0.65, 1.25, 0.04]} /></mesh>
          <mesh position={[0, 1.8, 1.12]} material={neon}><boxGeometry args={[1.4, 0.26, 0.05]} /></mesh>
        </>
      );
  }
}

function Landmark({
  frames, epoch, view, hues, selected, inFocus, struggling, onSelect, emphasized = false, beaconRgb,
}: {
  /** Holds the pausable animation clock every pulse and spring runs on. */
  frames: RefObject<FrameStore>;
  /** The frame's epoch (see Frame.epoch). */
  epoch: number;
  view: VenueView;
  hues: Float32Array;
  selected: boolean;
  emphasized?: boolean;
  /** Overrides the beacon colour (the venue race's candidate colours). */
  beaconRgb?: Rgb;
  /** On the path to closing (see isStruggling): shows the red warning pulse. */
  struggling: boolean;
  /** False when a focus is active and this venue is outside it: it dims. */
  inFocus: boolean;
  onSelect: (slot: number) => void;
}) {
  const [x, z] = view.position;
  // The sign shows tonight's crowd (its dominant scene); the body and roof band show the venue's own
  // identity (the live scene its taste best matches), so a venue taken over by another crowd shows it.
  const tonight = view.dominantScene >= 0 ? sceneRgb(hues, view.dominantScene) : NEUTRAL_SIGN;
  const identity = view.identityScene >= 0 ? sceneRgb(hues, view.identityScene) : NEUTRAL_SIGN;
  const beaconScene = venueBeaconScene(view);
  const beaconColour = beaconRgb ?? (beaconScene >= 0 ? sceneRgb(hues, beaconScene) : NEUTRAL_SIGN);
  const [r, g, b] = tonight;
  const glow = view.open ? 0.5 + 2.2 * view.health : 0.04;
  const sign: Rgb = [r * glow, g * glow, b * glow];
  const pillar = (24 * LANDMARK_SCALE) / view.scale;
  const beacon = (view.isEvent && view.open && inFocus) || emphasized;
  const mats = useMemo<Materials>(
    () => ({
      neon: new THREE.MeshBasicMaterial({ toneMapped: false }),
      body: new THREE.MeshStandardMaterial({ color: PAINT[view.kind], roughness: 0.95, flatShading: true, emissiveIntensity: 1 }),
      band: new THREE.MeshBasicMaterial({ toneMapped: false }),
      roof: new THREE.MeshStandardMaterial({ color: ROOFS[view.kind], roughness: 1, flatShading: true }),
      window: new THREE.MeshBasicMaterial({ color: "#d7a66b", toneMapped: false }),
      trim: new THREE.MeshStandardMaterial({ color: "#ead8af", roughness: 1, flatShading: true }),
    }),
    [view.kind],
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
      mats.roof?.dispose();
      mats.window?.dispose();
      mats.trim?.dispose();
    },
    [mats],
  );

  useFrame(() => {
    const { clock } = frames.current;
    const now = clock.now();
    const real = performance.now();
    let a = anim.current;
    if (!a) {
      // Rises out of the ground while playing; mounted while paused (the first city, or a venue placed
      // during a pause) it simply stands there, since a frozen clock would leave it buried.
      const rise = view.open && clock.playing;
      a = {
        y: view.open ? (rise ? BURIED * view.scale : 0) : CLOSED_SINK,
        vy: 0,
        last: now,
        lastReal: real,
        open: view.open,
        openedAt: rise ? now : -Infinity,
        flicker: 1,
        lit: view.open ? 1 : CLOSED_LIT,
        focus: inFocus ? 1 : UNFOCUSED_LIT,
        warn: struggling ? 1 : 0,
        epoch,
      };
      anim.current = a;
    }
    if (a.epoch !== epoch) {
      // A rewind or re-init is a cut, not a story: jump to the new state (it may arrive while paused).
      a.epoch = epoch;
      a.y = view.open ? 0 : CLOSED_SINK;
      a.vy = 0;
      a.open = view.open;
      a.openedAt = -Infinity;
      a.lit = view.open ? 1 : CLOSED_LIT;
      a.warn = struggling ? 1 : 0;
    }
    if (view.open && !a.open) a.openedAt = now;
    a.open = view.open;
    const dt = Math.min(1 / 30, Math.max(0, (now - a.last) / 1000));
    a.last = now;
    const realDt = Math.min(1 / 30, Math.max(0, (real - a.lastReal) / 1000));
    a.lastReal = real;

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
    a.focus += ((inFocus ? 1 : UNFOCUSED_LIT) - a.focus) * (1 - Math.exp(-realDt / 0.2));
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

    // Body glow and roofline band in the identity colour; closing dims them smoothly, never to black.
    a.lit += ((view.open ? 1 : CLOSED_LIT) - a.lit) * (1 - Math.exp(-dt / 0.3));
    const glowBody = BODY_EMISSIVE * a.lit * a.focus;
    // Painted architecture needs the same focus fade as its lights under the brighter dusk lighting.
    mats.body.color.copy(PAINT_COLOURS[view.kind]).multiplyScalar(a.focus);
    mats.roof?.color.copy(ROOF_COLOURS[view.kind]).multiplyScalar(a.focus);
    mats.trim?.color.copy(TRIM_COLOUR).multiplyScalar(a.focus);
    mats.body.emissive.setRGB(identity[0] * glowBody, identity[1] * glowBody, identity[2] * glowBody);
    const glowBand = BAND * a.lit * a.flicker * a.focus;
    mats.window?.color.setRGB(0.65 * a.lit * a.focus, 0.43 * a.lit * a.focus, 0.23 * a.lit * a.focus);
    mats.band.color.setRGB(
      (identity[0] + (WARNING_RGB[0] - identity[0]) * red) * glowBand,
      (identity[1] + (WARNING_RGB[1] - identity[1]) * red) * glowBand,
      (identity[2] + (WARNING_RGB[2] - identity[2]) * red) * glowBand,
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
                color={beaconColour}
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
                color={beaconColour}
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
  world, layout, frames, frame, selected, focus, rules, onSelect,
}: {
  world: World;
  frames: RefObject<FrameStore>;
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
        <Landmark key={v.slot} frames={frames} epoch={frame?.epoch ?? -1} view={v} hues={hues} selected={selected === v.slot} emphasized={(focus?.kind === "experiment" && focus.targets.has(v.slot)) || (focus?.kind === "race" && focus.hosts.includes(v.slot))} beaconRgb={focus?.kind === "race" && focus.hosts.includes(v.slot) ? RACE_RGB[focus.hosts.indexOf(v.slot)] as Rgb : undefined} inFocus={venueInFocus(focus, v)} struggling={venueInFocus(focus, v) && !!frame && isStruggling(frame, v.slot, rules)} onSelect={(slot) => { if (canInspectVenue(focus, slot)) onSelect(slot); }} />
      ))}
    </group>
  );
}
