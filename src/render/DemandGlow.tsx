"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { CityLayout } from "@/render/layout";

/** Just above the scene auras (0.09), below ripples (0.12). */
const GLOW_Y = 0.1;
const AMBER = new THREE.Color(1, 0.62, 0.22);
/**
 * Centre brightness of the highest-demand cell (× amber). With the dimmed scene auras underneath it stays
 * well under the bloom threshold (0.55), so the ground reads as warm, never a white wash.
 */
const PEAK = 0.2;
/** Cells below this share of the top demand don't glow at all, so the map isn't tinted everywhere. */
const CUTOFF = 0.08;
/** Radius = RADIUS_PER_SPACING × cell spacing × (0.6 + 0.4 × share). */
const RADIUS_PER_SPACING = 0.75;
const FADE_IN_S = 0.9;
/** Time constant of the glide to a new demand map (another headliner). */
const GLIDE_S = 0.5;
const BREATH_HZ = 0.25;
const BREATH_DEPTH = 0.1;

const VERTEX = /* glsl */ `
  attribute vec3 aTint;
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    vUv = uv;
    vTint = aTint;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT = /* glsl */ `
  varying vec2 vUv;
  varying vec3 vTint;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float f = exp(-d * d * 2.2) * (1.0 - smoothstep(0.7, 1.0, d));
    gl_FragColor = vec4(vTint * f, 1.0);
  }
`;

/**
 * Soft amber discs on the ground where residents' taste fits the headliner being scouted: one per cell,
 * brightness and size by the cell's share of the top demand. Fades in on mount and glides between maps.
 */
export function DemandGlow({ layout, demand }: { layout: CityLayout; demand: number[] }) {
  const n = layout.cellX.length;
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    g.setAttribute("aTint", new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3));
    return g;
  }, [n]);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VERTEX,
        fragmentShader: FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -1,
        polygonOffsetUnits: -4,
      }),
    [],
  );
  const targets = useMemo(() => {
    const max = Math.max(0, ...demand);
    return Float32Array.from({ length: n }, (_, c) => {
      const share = max > 0 ? (demand[c] ?? 0) / max : 0;
      return share < CUTOFF ? 0 : share;
    });
  }, [demand, n]);
  const levels = useRef<Float32Array | null>(null);
  const fade = useRef(0);
  const scratch = useMemo(() => new THREE.Matrix4(), []);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useFrame((state, delta) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const dt = Math.min(1 / 15, Math.max(0, delta));
    if (!levels.current || levels.current.length !== n) levels.current = targets.slice();
    const lv = levels.current;
    fade.current = Math.min(1, fade.current + dt / FADE_IN_S);
    const glide = 1 - Math.exp(-dt / GLIDE_S);
    const breath = 1 + BREATH_DEPTH * Math.sin(state.clock.elapsedTime * BREATH_HZ * Math.PI * 2);
    const tint = mesh.geometry.getAttribute("aTint") as THREE.InstancedBufferAttribute;
    for (let c = 0; c < n; c++) {
      lv[c] += (targets[c] - lv[c]) * glide;
      const share = lv[c];
      const r = share > 0.001 ? RADIUS_PER_SPACING * layout.spacing * (0.6 + 0.4 * share) : 0;
      mesh.setMatrixAt(c, scratch.makeScale(r, 1, r).setPosition(layout.cellX[c], GLOW_Y, layout.cellZ[c]));
      const k = PEAK * share ** 1.6 * fade.current * breath;
      tint.setXYZ(c, AMBER.r * k, AMBER.g * k, AMBER.b * k);
    }
    mesh.instanceMatrix.needsUpdate = true;
    tint.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, n]} frustumCulled={false} renderOrder={1} />;
}
