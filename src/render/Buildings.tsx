"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BUILDING_FRAGMENT, BUILDING_VERTEX, ROOF_FRAGMENT } from "@/render/buildingShader";
import { buildingProportions, gableGeometry } from "@/render/architecture";
import type { FrameStore } from "@/render/frame-store";
import { type CityLayout, hash01 } from "@/render/layout";

export function Buildings({ frames, layout, dimmed = false }: { frames: RefObject<FrameStore>; layout: CityLayout; dimmed?: boolean }) {
  const { count } = layout.buildings;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const roofRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 }, uFocus: { value: 1 } }), []);
  const roofs = useMemo(() => {
    const g = gableGeometry();
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(layout.buildings.seed, 1));
    return g;
  }, [layout]);
  useEffect(() => () => roofs.dispose(), [roofs]);
  const lit = useMemo(() => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = 0.2 + 0.55 * hash01(i * 7 + 3);
    return out;
  }, [count]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    const roof = roofRef.current;
    if (!mesh || !roof) return;
    const b = layout.buildings;
    const m = new THREE.Matrix4();
    for (let i = 0; i < b.count; i++) {
      const form = buildingProportions(b.w[i], b.d[i], b.h[i]);
      m.makeScale(b.w[i], form.wall, b.d[i]);
      m.setPosition(b.x[i], 0, b.z[i]);
      mesh.setMatrixAt(i, m);
      m.makeScale(b.w[i], form.roof, b.d[i]);
      m.setPosition(b.x[i], form.wall, b.z[i]);
      roof.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
    roof.instanceMatrix.needsUpdate = true;
    roof.computeBoundingSphere();
  }, [layout]);

  // Window flicker runs on the pausable animation clock, so a pause freezes it too.
  useFrame(() => {
    const time = frames.current.clock.now() / 1000;
    for (const mesh of [meshRef.current, roofRef.current]) {
      const material = mesh?.material as THREE.ShaderMaterial | undefined;
      if (material?.uniforms) {
        material.uniforms.uTime.value = time;
        material.uniforms.uFocus.value = dimmed ? 0.08 : 1;
      }
    }
  });

  return (
    <group>
    <instancedMesh key={`walls-${count}`} ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]}>
        <instancedBufferAttribute attach="attributes-aSeed" args={[layout.buildings.seed, 1]} />
        <instancedBufferAttribute attach="attributes-aLit" args={[lit, 1]} />
      </boxGeometry>
      <shaderMaterial ref={materialRef} uniforms={uniforms} vertexShader={BUILDING_VERTEX} fragmentShader={BUILDING_FRAGMENT} />
    </instancedMesh>
    <instancedMesh key={`roofs-${count}`} ref={roofRef} args={[roofs, undefined, count]}>
      <shaderMaterial uniforms={uniforms} vertexShader={ROOF_VERTEX} fragmentShader={ROOF_FRAGMENT} />
    </instancedMesh>
    </group>
  );
}

/** Roof geometry has its base at zero already; unlike the box shader it needs no half-unit lift. */
const ROOF_VERTEX = BUILDING_VERTEX.replace("position + vec3(0.0, 0.5, 0.0)", "position");
