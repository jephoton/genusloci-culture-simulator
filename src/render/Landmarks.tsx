"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { type ReactNode, useMemo } from "react";
import { type CityLayout, LANDMARK_RADIUS, LANDMARK_SCALE } from "@/render/layout";
import { type Rgb, sceneHues, sceneRgb } from "@/render/palette";
import { type VenueView, venueViews } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { VenueKind, World } from "@/world/schema";

const BODY = "#151821";
const NEUTRAL_SIGN: Rgb = [0.9, 0.85, 0.75];
const CLOSED_SINK = -3.5;
/** The stadium is modelled with a 4.4-unit ring; it is drawn shrunk to LANDMARK_RADIUS.stadium so it fits a pad. */
const STADIUM_SHRINK = LANDMARK_RADIUS.stadium / 4.4;

function Body({ kind, sign }: { kind: VenueKind; sign: Rgb }): ReactNode {
  const body = <meshStandardMaterial color={BODY} roughness={0.8} />;
  const neon = <meshBasicMaterial color={sign} toneMapped={false} />;
  switch (kind) {
    case "club":
      return (
        <>
          <mesh position-y={1.2}><boxGeometry args={[3.2, 2.4, 3.2]} />{body}</mesh>
          <mesh position={[0, 2.0, 1.62]}><boxGeometry args={[2.6, 0.3, 0.05]} />{neon}</mesh>
          <mesh position-y={2.45}><boxGeometry args={[3.3, 0.08, 3.3]} />{neon}</mesh>
        </>
      );
    case "bar":
      return (
        <>
          <mesh position-y={0.8}><boxGeometry args={[2.6, 1.6, 2.4]} />{body}</mesh>
          <mesh position={[0, 1.25, 1.45]}><boxGeometry args={[2.8, 0.1, 0.8]} /><meshStandardMaterial color="#3a1f2b" /></mesh>
          <mesh position={[0, 1.45, 1.23]}><boxGeometry args={[1.6, 0.28, 0.05]} />{neon}</mesh>
        </>
      );
    case "cafe":
      return (
        <>
          <mesh position-y={0.65}><cylinderGeometry args={[1.4, 1.4, 1.3, 20]} />{body}</mesh>
          <mesh position-y={1.75}><coneGeometry args={[1.7, 0.9, 20]} />{body}</mesh>
          <mesh position-y={1.3} rotation-x={Math.PI / 2}><torusGeometry args={[1.45, 0.06, 8, 32]} />{neon}</mesh>
        </>
      );
    case "restaurant":
      return (
        <>
          <mesh position-y={0.75}><boxGeometry args={[3.2, 1.5, 2.4]} />{body}</mesh>
          <mesh position-y={2.1} rotation-y={Math.PI / 4}><coneGeometry args={[2.4, 1.2, 4]} />{body}</mesh>
          <mesh position={[0, 1.2, 1.23]}><boxGeometry args={[1.8, 0.3, 0.05]} />{neon}</mesh>
        </>
      );
    case "gallery":
      return (
        <>
          <mesh position-y={1.3}><boxGeometry args={[3, 2.6, 3]} /><meshStandardMaterial color="#2a2d36" roughness={0.6} /></mesh>
          <mesh position-y={0.05}><boxGeometry args={[3.1, 0.06, 3.1]} />{neon}</mesh>
        </>
      );
    case "music_venue":
      return (
        <>
          <mesh rotation-z={Math.PI / 2}><cylinderGeometry args={[2, 2, 5, 20]} />{body}</mesh>
          <mesh position={[0, 1.1, 2.02]}><boxGeometry args={[3, 0.5, 0.05]} />{neon}</mesh>
        </>
      );
    case "shop":
      return (
        <>
          <mesh position-y={0.7}><boxGeometry args={[1.8, 1.4, 1.8]} />{body}</mesh>
          <mesh position={[0, 1.15, 0.93]}><boxGeometry args={[1.2, 0.22, 0.05]} />{neon}</mesh>
        </>
      );
    case "stadium":
      return (
        <group scale={STADIUM_SHRINK}>
          <mesh position-y={0.8} rotation-x={Math.PI / 2}><torusGeometry args={[3.4, 1, 10, 32]} />{body}</mesh>
          <mesh position-y={1.6} rotation-x={Math.PI / 2}><torusGeometry args={[4.2, 0.08, 8, 48]} />{neon}</mesh>
        </group>
      );
    default:
      return (
        <>
          <mesh position-y={1.1}><boxGeometry args={[2.2, 2.2, 2.2]} />{body}</mesh>
          <mesh position={[0, 1.8, 1.12]}><boxGeometry args={[1.4, 0.26, 0.05]} />{neon}</mesh>
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
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    onSelect(view.slot);
  };
  return (
    <group position={[x, view.open ? 0 : CLOSED_SINK, z]} scale={view.scale} onClick={onClick}>
      <Body kind={view.kind} sign={sign} />
      {view.isEvent && view.open && (
        // The pillar keeps its full-scale height on shrunken pads.
        <mesh position-y={pillar / 2}>
          <cylinderGeometry args={[0.35, 0.35, pillar, 12, 1, true]} />
          <meshBasicMaterial color={sign} toneMapped={false} transparent opacity={0.55} />
        </mesh>
      )}
      {selected && (
        <mesh rotation-x={-Math.PI / 2} position-y={0.06 - (view.open ? 0 : CLOSED_SINK) / view.scale}>
          <ringGeometry args={[3.6, 4.1, 48]} />
          <meshBasicMaterial color={[2, 2, 2]} toneMapped={false} />
        </mesh>
      )}
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
  const views = useMemo(() => (frame ? venueViews(frame, layout, world) : []), [frame, layout, world]);
  const hues = useMemo(() => (frame ? sceneHues(frame.lineageParents) : new Float32Array(0)), [frame]);
  return (
    <group>
      {views.map((v) => (
        <Landmark key={v.slot} view={v} hues={hues} selected={selected === v.slot} onSelect={onSelect} />
      ))}
    </group>
  );
}
