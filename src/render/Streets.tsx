"use client";

import { useEffect, useMemo } from "react";
import { ribbonGeometry } from "@/render/geometry";
import { type CityLayout, ROAD_HALF_WIDTH } from "@/render/layout";

export function Streets({ layout }: { layout: CityLayout }) {
  const geometry = useMemo(() => {
    const major = layout.roads.filter((r) => r.kind === "major").map((r) => r.points);
    const minor = layout.roads.filter((r) => r.kind === "minor").map((r) => r.points);
    return {
      major: ribbonGeometry(major, ROAD_HALF_WIDTH.major),
      minor: ribbonGeometry(minor, ROAD_HALF_WIDTH.minor),
      glow: ribbonGeometry(major, 0.08),
    };
  }, [layout]);
  useEffect(
    () => () => {
      geometry.major.dispose();
      geometry.minor.dispose();
      geometry.glow.dispose();
    },
    [geometry],
  );
  return (
    <group>
      <mesh geometry={geometry.minor} position-y={0.04}>
        <meshStandardMaterial color="#14161d" roughness={0.9} />
      </mesh>
      <mesh geometry={geometry.major} position-y={0.05}>
        <meshStandardMaterial color="#181b24" roughness={0.85} />
      </mesh>
      <mesh geometry={geometry.glow} position-y={0.07}>
        <meshBasicMaterial color={[0.35, 0.5, 1.6]} toneMapped={false} />
      </mesh>
    </group>
  );
}
