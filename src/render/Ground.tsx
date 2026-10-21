"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { type RefObject, useEffect, useMemo } from "react";
import { polygonGeometry } from "@/render/geometry";
import type { CityLayout } from "@/render/layout";

/** Pointer movement (px) above which a press counts as a drag, not a click. */
const CLICK_SLOP = 4;

/** Where the pointer is over the ground, written on pointer move and read by renderers in `useFrame`. */
export type GroundPointer = { x: number; z: number; over: boolean };

export function Ground({
  layout, onGroundClick, pointerRef,
}: {
  layout: CityLayout;
  onGroundClick: (x: number, z: number) => void;
  /** Updated on every pointer move; readers sample it once per animation frame. */
  pointerRef?: RefObject<GroundPointer>;
}) {
  const water = useMemo(() => polygonGeometry(layout.water), [layout]);
  const parks = useMemo(() => polygonGeometry(layout.parks), [layout]);
  useEffect(
    () => () => {
      water?.dispose();
      parks?.dispose();
    },
    [water, parks],
  );
  const { center, bounds } = layout;
  const width = (bounds.maxX - bounds.minX) * 1.6;
  const depth = (bounds.maxZ - bounds.minZ) * 1.6;
  const onClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > CLICK_SLOP) return;
    e.stopPropagation();
    onGroundClick(e.point.x, e.point.z);
  };
  const onPointerMove = (e: ThreeEvent<PointerEvent>) => {
    if (!pointerRef) return;
    pointerRef.current.x = e.point.x;
    pointerRef.current.z = e.point.z;
    pointerRef.current.over = true;
  };
  const onPointerOut = () => {
    if (pointerRef) pointerRef.current.over = false;
  };
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[center.x, 0, center.z]} onClick={onClick} onPointerMove={onPointerMove} onPointerOut={onPointerOut}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#35464a" roughness={1} />
      </mesh>
      {water && (
        <mesh geometry={water} position-y={0.02}>
          <meshStandardMaterial color="#34758a" emissive="#173f50" emissiveIntensity={0.2} roughness={0.45} metalness={0.15} />
        </mesh>
      )}
      {parks && (
        <mesh geometry={parks} position-y={0.03}>
          <meshStandardMaterial color="#46745c" roughness={1} />
        </mesh>
      )}
    </group>
  );
}
