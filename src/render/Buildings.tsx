"use client";

import { useFrame } from "@react-three/fiber";
import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { BUILDING_FRAGMENT, BUILDING_VERTEX } from "@/render/buildingShader";
import { type CityLayout, hash01 } from "@/render/layout";

export function Buildings({ layout }: { layout: CityLayout }) {
  const { count } = layout.buildings;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const materialRef = useRef<THREE.ShaderMaterial>(null);
  const uniforms = useMemo(() => ({ uTime: { value: 0 } }), []);
  const lit = useMemo(() => {
    const out = new Float32Array(count);
    for (let i = 0; i < count; i++) out[i] = 0.2 + 0.55 * hash01(i * 7 + 3);
    return out;
  }, [count]);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const b = layout.buildings;
    const m = new THREE.Matrix4();
    for (let i = 0; i < b.count; i++) {
      m.makeScale(b.w[i], b.h[i], b.d[i]);
      m.setPosition(b.x[i], 0, b.z[i]);
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
    mesh.computeBoundingSphere();
  }, [layout]);

  useFrame((state) => {
    if (materialRef.current) materialRef.current.uniforms.uTime.value = state.clock.elapsedTime;
  });

  return (
    <instancedMesh key={count} ref={meshRef} args={[undefined, undefined, count]}>
      <boxGeometry args={[1, 1, 1]}>
        <instancedBufferAttribute attach="attributes-aSeed" args={[layout.buildings.seed, 1]} />
        <instancedBufferAttribute attach="attributes-aLit" args={[lit, 1]} />
      </boxGeometry>
      <shaderMaterial ref={materialRef} uniforms={uniforms} vertexShader={BUILDING_VERTEX} fragmentShader={BUILDING_FRAGMENT} />
    </instancedMesh>
  );
}
