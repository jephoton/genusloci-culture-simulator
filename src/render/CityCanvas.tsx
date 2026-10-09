"use client";

import { MapControls } from "@react-three/drei";
import { Canvas } from "@react-three/fiber";
import { Bloom, EffectComposer, Vignette } from "@react-three/postprocessing";
import type { RefObject } from "react";
import { Buildings } from "@/render/Buildings";
import { Crowd } from "@/render/Crowd";
import type { FrameStore } from "@/render/frame-store";
import { Ground } from "@/render/Ground";
import { Landmarks } from "@/render/Landmarks";
import type { CityLayout } from "@/render/layout";
import { Streets } from "@/render/Streets";
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
};

export function CityCanvas(props: CityCanvasProps) {
  const { layout } = props;
  const size = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxZ - layout.bounds.minZ);
  const { x, z } = layout.center;
  return (
    <div className="absolute inset-0" style={{ cursor: props.cursor }}>
      <Canvas
        dpr={[1, 2]}
        gl={{ powerPreference: "high-performance" }}
        camera={{ position: [x, size * 0.16, z + size * 0.2], fov: 42, near: 0.5, far: size * 8 }}
      >
        <color attach="background" args={["#07080b"]} />
        <fog attach="fog" args={["#07080b", size * 0.25, size * 1.1]} />
        <ambientLight intensity={0.35} color="#9aa7ff" />
        <directionalLight position={[x + size, size, z + size * 0.4]} intensity={0.6} color="#b8c4ff" />
        <Ground layout={layout} onGroundClick={props.onGroundClick} />
        <Streets layout={layout} />
        <Buildings layout={layout} />
        <Landmarks world={props.world} layout={layout} frame={props.frame} selected={props.selectedVenue} onSelect={props.onVenueClick} />
        <Crowd world={props.world} layout={layout} frames={props.frames} slots={props.agentSlots} tickMs={props.tickMs} />
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
        <EffectComposer>
          <Bloom mipmapBlur intensity={1.15} luminanceThreshold={0.55} luminanceSmoothing={0.25} />
          <Vignette offset={0.25} darkness={0.75} />
        </EffectComposer>
      </Canvas>
    </div>
  );
}
