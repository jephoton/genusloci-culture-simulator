"use client";

import { useFrame } from "@react-three/fiber";
import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Focus } from "@/render/focus";
import type { CityLayout } from "@/render/layout";
import { type Rgb, sceneHuesOf, sceneRgb } from "@/render/palette";
import { sceneTerritories } from "@/render/scene-territory";
import type { Frame } from "@/sim/frame";

/** Instance slots: maxScenes live auras plus the ones still fading out. */
const MAX_AURAS = 32;
/** Just above the street glow (0.07), below ripples (0.12) and crowds. */
const AURA_Y = 0.09;
/** Radius = clamp(RADIUS_PER_SPREAD × RMS spread, MIN_RADIUS, MAX_RADIUS_FRAC × city size). */
const RADIUS_PER_SPREAD = 1.6;
const MIN_RADIUS = 15;
const MAX_RADIUS_FRAC = 0.45;
/**
 * Centre brightness of the largest scene's aura (× its colour); smaller scenes scale by sqrt(size / largest).
 * Kept well under the bloom threshold (0.55) so overlapping auras still read as a tint, not a glow.
 */
const PEAK = 0.16;
/** The faintest a live aura gets, so a small scene still shows. */
const FLOOR = 0.04;
/** Time constant of the glide towards a new centroid and radius. */
const GLIDE_S = 0.8;
const FADE_IN_S = 0.8;
const FADE_OUT_S = 1;
/** A newborn scene starts at 1 + BIRTH_PULSE times its brightness, decaying with BIRTH_DECAY_S (≈ gone by 1.5 s). */
const BIRTH_PULSE = 1;
const BIRTH_DECAY_S = 0.45;
const BREATH_HZ = 0.15;
const BREATH_DEPTH = 0.12;
/** Under a scene focus, other scenes' auras keep this fraction of their light. */
const UNFOCUSED_LIT = 0.25;
const FOCUS_S = 0.25;

type Aura = {
  x: number; z: number; r: number;
  /** Where the aura is gliding to: its scene's latest centroid and radius. */
  tx: number; tz: number; tr: number;
  /** Fade-in/out envelope in [0, 1]. */
  opacity: number;
  /** Brightness the aura is heading to (0 once its scene has gone). */
  target: number;
  level: number;
  focus: number;
  rgb: Rgb;
  /** Seconds since birth for the pulse; Infinity for scenes that were already there. */
  age: number;
  live: boolean;
};

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
    // Gaussian-ish core with a smooth rim, so the disc has no visible edge.
    float f = exp(-d * d * 2.5) * (1.0 - smoothstep(0.7, 1.0, d));
    gl_FragColor = vec4(vTint * f, 1.0);
  }
`;

/**
 * Soft, additive discs on the ground in each scene's colour, centred on where its members live and
 * as wide as they spread: you can see scenes form, drift, grow and fade. Smoothed per lineage id.
 */
export function SceneAuras({ layout, frame, focus }: { layout: CityLayout; frame: Frame | null; focus: Focus }) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const territories = useMemo(() => (frame ? sceneTerritories(frame, layout) : []), [frame, layout]);
  const hues = useMemo(() => (frame ? sceneHuesOf(frame.lineageParents) : new Float32Array(0)), [frame]);
  const geometry = useMemo(() => {
    const g = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
    g.setAttribute("aTint", new THREE.InstancedBufferAttribute(new Float32Array(MAX_AURAS * 3), 3));
    return g;
  }, []);
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
  const aurasRef = useRef(new Map<number, Aura>());
  const seen = useRef<{ territories: typeof territories | null; epoch: number }>({ territories: null, epoch: -1 });
  const scratch = useMemo(() => new THREE.Matrix4(), []);
  const size = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxZ - layout.bounds.minZ);

  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material],
  );

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_AURAS; i++) mesh.setMatrixAt(i, hidden);
    mesh.instanceMatrix.needsUpdate = true;
  }, []);

  useFrame((state, delta) => {
    const dt = Math.min(1 / 15, Math.max(0, delta));
    const s = seen.current;
    const auras = aurasRef.current;

    // New frame: retarget every aura; scenes that are gone start fading out.
    if (territories !== s.territories) {
      // The first frame, and the first after a rewind or re-init, fade in without a birth pulse.
      const epoch = frame?.epoch ?? -1;
      const continuous = s.territories !== null && epoch === s.epoch;
      s.territories = territories;
      s.epoch = epoch;
      let largest = 1;
      for (const t of territories) largest = Math.max(largest, t.size);
      for (const a of auras.values()) a.live = false;
      for (const t of territories) {
        const r = Math.min(MAX_RADIUS_FRAC * size, Math.max(MIN_RADIUS, RADIUS_PER_SPREAD * t.spread));
        const target = Math.max(FLOOR, PEAK * Math.sqrt(t.size / largest));
        let a = auras.get(t.id);
        if (!a) {
          a = { x: t.x, z: t.z, r: r * 0.6, tx: t.x, tz: t.z, tr: r, opacity: 0, target, level: target, focus: 1, rgb: sceneRgb(hues, t.id), age: continuous ? 0 : Infinity, live: true };
          auras.set(t.id, a);
        }
        a.live = true;
        a.target = target;
        a.rgb = sceneRgb(hues, t.id);
        a.tx = t.x;
        a.tz = t.z;
        a.tr = r;
      }
    }

    const glide = 1 - Math.exp(-dt / GLIDE_S);
    const focusK = 1 - Math.exp(-dt / FOCUS_S);
    const t = state.clock.elapsedTime;
    const mesh = meshRef.current;
    const tint = mesh?.geometry.getAttribute("aTint") as THREE.InstancedBufferAttribute | undefined;
    let i = 0;
    for (const [id, a] of auras) {
      if (a.live) {
        a.x += (a.tx - a.x) * glide;
        a.z += (a.tz - a.z) * glide;
        a.r += (a.tr - a.r) * glide;
        a.opacity = Math.min(1, a.opacity + dt / FADE_IN_S);
      } else {
        a.opacity -= dt / FADE_OUT_S;
        if (a.opacity <= 0) {
          auras.delete(id);
          continue;
        }
      }
      a.level += (a.target - a.level) * glide;
      a.age += dt;
      const inFocus = focus?.kind !== "scene" || focus.id === id;
      a.focus += ((inFocus ? 1 : UNFOCUSED_LIT) - a.focus) * focusK;
      if (!mesh || !tint || i >= MAX_AURAS) continue;
      const pulse = 1 + BIRTH_PULSE * Math.exp(-a.age / BIRTH_DECAY_S);
      const breath = 1 + BREATH_DEPTH * Math.sin(t * BREATH_HZ * Math.PI * 2 + id * 1.7);
      const k = a.level * a.opacity * a.focus * pulse * breath;
      mesh.setMatrixAt(i, scratch.makeScale(a.r, 1, a.r).setPosition(a.x, AURA_Y, a.z));
      tint.setXYZ(i, a.rgb[0] * k, a.rgb[1] * k, a.rgb[2] * k);
      i++;
    }
    if (!mesh || !tint) return;
    for (let j = i; j < MAX_AURAS; j++) mesh.setMatrixAt(j, scratch.makeScale(0, 0, 0));
    mesh.instanceMatrix.needsUpdate = true;
    tint.needsUpdate = true;
  });

  return <instancedMesh ref={meshRef} args={[geometry, material, MAX_AURAS]} frustumCulled={false} renderOrder={1} />;
}
