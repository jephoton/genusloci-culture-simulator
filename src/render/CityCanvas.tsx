"use client";

import { MapControls } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import { type RefObject, useMemo, useRef } from "react";
import { CameraDirector, type FlyTo } from "@/render/CameraDirector";
import { Crowd } from "@/render/Crowd";
import { DemandGlow } from "@/render/DemandGlow";
import type { FrameChange } from "@/render/effects/diff";
import type { Origin } from "@/render/effects/director";
import { Effects } from "@/render/effects/Effects";
import { ShockwaveEffect } from "@/render/effects/ShockwaveEffect";
import type { Focus } from "@/render/focus";
import type { FrameStore } from "@/render/frame-store";
import { Ghost, type GhostSpec } from "@/render/Ghost";
import { Ground, type GroundPointer } from "@/render/Ground";
import { Landmarks } from "@/render/Landmarks";
import type { CityLayout } from "@/render/layout";
import { SceneAuras } from "@/render/SceneAuras";
import { type ScoutPin, ScoutPins } from "@/render/ScoutPins";
import { type RacePin, RacePins } from "@/render/RacePins";
import { RaceWalkers } from "@/render/RaceWalkers";
import { Streets } from "@/render/Streets";
import { StreetLabels } from "@/render/StreetLabels";
import type { ClosureRules } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

export type CityCanvasProps = {
  world: World;
  layout: CityLayout;
  frames: RefObject<FrameStore>;
  frame: Frame | null;
  agentSlots: number;
  tickMs: number;
  selectedVenue: number | null;
  onVenueClick: (slot: number) => void;
  onGroundClick: (x: number, z: number) => void;
  cursor: string;
  /** What the active placement tool would place, previewed under the cursor; null when not placing. */
  ghost: GhostSpec | null;
  /** The scene or venue being followed; everything else dims. */
  focus: Focus;
  /** Latest camera flight request (see CameraDirector). */
  flyTo: RefObject<FlyTo | null>;
  /** Visible changes between consecutive frames (the ones the effects play), for toasts. */
  onFrameChanges: (changes: FrameChange[], frame: Frame) => void;
  /** The sim's closure rules: when a venue counts as struggling. */
  rules: ClosureRules;
  /** Whether a change was the player's doing (full shockwave) or the simulation's (softer). */
  classifyChange?: (change: FrameChange, frame: Frame) => Origin;
  /** Scout mode overlay: the headliner's demand per cell and the lettered spots; null when not scouting. */
  scout?: ScoutOverlay | null;
  /** Venue race badges over the candidate venues. */
  racePins?: RacePin[];
};

export type ScoutOverlay = {
  demand: number[] | null;
  pins: ScoutPin[];
  /** Cell of the pin to highlight (a hovered card), or null. */
  highlighted: number | null;
  /** Cell of the top-ranked spot, or null before results arrive. */
  best: number | null;
};

/**
 * Advances the pausable animation clock once per rendered frame, before any renderer reads it (a
 * negative priority runs first without taking over rendering).
 */
function ClockDriver({ frames }: { frames: RefObject<FrameStore> }) {
  useFrame(() => frames.current.clock.sync(performance.now()), -1);
  return null;
}

export function CityCanvas(props: CityCanvasProps) {
  const { layout } = props;
  const shockwave = useMemo(() => new ShockwaveEffect(), []);
  const pointerRef = useRef<GroundPointer>({ x: 0, z: 0, over: false });
  const size = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxZ - layout.bounds.minZ);
  const { x, z } = layout.center;
  return (
    <div className="absolute inset-0" style={{ cursor: props.cursor }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: "high-performance" }}
        camera={{ position: [x, size * 0.16, z + size * 0.2], fov: 42, near: 0.5, far: size * 8 }}
      >
        <ClockDriver frames={props.frames} />
        <color attach="background" args={["#192a36"]} />
        <fog attach="fog" args={["#192a36", size * 0.3, size * 1.2]} />
        <ambientLight intensity={0.9} color="#cedef2" />
        <directionalLight position={[x + size, size, z + size * 0.4]} intensity={1.8} color="#ffe1bc" />
        <Ground layout={layout} onGroundClick={props.onGroundClick} pointerRef={pointerRef} />
        <Streets layout={layout} />
        <StreetLabels world={props.world} layout={layout} />
        <SceneAuras world={props.world} layout={layout} frames={props.frames} frame={props.frame} focus={props.focus} dimmed={!!props.scout} />
        {props.scout?.demand && <DemandGlow frames={props.frames} layout={layout} demand={props.scout.demand} />}
        {props.scout && <ScoutPins frames={props.frames} layout={layout} pins={props.scout.pins} highlighted={props.scout.highlighted} best={props.scout.best} />}
        <Landmarks world={props.world} layout={layout} frames={props.frames} frame={props.frame} selected={props.selectedVenue} focus={props.focus} rules={props.rules} onSelect={props.onVenueClick} />
        {props.racePins && <RacePins pins={props.racePins} />}
        <Crowd world={props.world} layout={layout} frames={props.frames} slots={props.agentSlots} tickMs={props.tickMs} focus={props.focus} />
        {props.racePins && <RaceWalkers world={props.world} layout={layout} frames={props.frames} tickMs={props.tickMs} />}
        {props.ghost && <Ghost layout={layout} frames={props.frames} pointerRef={pointerRef} spec={props.ghost} />}
        <Effects world={props.world} layout={layout} frames={props.frames} shockwave={shockwave} rules={props.rules} onChanges={props.onFrameChanges} classify={props.classifyChange} muted={props.focus?.kind === "experiment" || props.focus?.kind === "race"} />
        <MapControls
          makeDefault
          target={[x, 0, z]}
          enableDamping
          dampingFactor={0.08}
          zoomSpeed={2.5}
          screenSpacePanning={false}
          maxPolarAngle={Math.PI * 0.43}
          minDistance={8}
          maxDistance={size * 1.6}
        />
        <CameraDirector flyTo={props.flyTo} />
        <EffectComposer>
          <primitive object={shockwave} />
          <Bloom mipmapBlur intensity={0.4} luminanceThreshold={0.9} luminanceSmoothing={0.3} />
          <Vignette offset={0.25} darkness={0.45} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
