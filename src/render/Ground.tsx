"use client";

import type { ThreeEvent } from "@react-three/fiber";
import { useEffect, useMemo } from "react";
import { polygonGeometry } from "@/render/geometry";
import type { CityLayout } from "@/render/layout";

/** Pointer movement (px) above which a press counts as a drag, not a click. */
const CLICK_SLOP = 4;

export function Ground({ layout, onGroundClick }: { layout: CityLayout; onGroundClick: (x: number, z: number) => void }) {
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
  return (
    <group>
      <mesh rotation-x={-Math.PI / 2} position={[center.x, 0, center.z]} onClick={onClick}>
        <planeGeometry args={[width, depth]} />
        <meshStandardMaterial color="#0c0e13" roughness={1} />
      </mesh>
      {water && (
        <mesh geometry={water} position-y={0.02}>
          <meshStandardMaterial color="#0a1726" roughness={0.25} metalness={0.3} />
        </mesh>
      )}
      {parks && (
        <mesh geometry={parks} position-y={0.03}>
          <meshStandardMaterial color="#0d1c12" roughness={1} />
        </mesh>
      )}
    </group>
  );
}
