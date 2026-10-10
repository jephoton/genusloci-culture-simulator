"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import type { Focus } from "@/render/focus";
import type { FrameStore } from "@/render/frame-store";
import type { CityLayout } from "@/render/layout";
import { type Rgb, sceneHuesOf, sceneRgb } from "@/render/palette";
import { sceneHotspots } from "@/render/scene-hotspots";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

/** Instance slots: live hotspots (at most MAX_HOTSPOTS_PER_SCENE × maxScenes) plus the ones still fading out. */
const MAX_AURAS = 256;
/** Just above the street glow (0.07), below ripples (0.12) and crowds. */
const AURA_Y = 0.09;
/** Radius = RADIUS_PER_SPACING × cell spacing × (1 - RADIUS_BY_STRENGTH + RADIUS_BY_STRENGTH × strength). */
const RADIUS_PER_SPACING = 0.6;
const RADIUS_BY_STRENGTH = 0.3;
/**
 * Centre brightness of a full-strength hotspot (× its colour). The hotspots of several scenes in one cell
 * share at most CELL_CAP between them. Both stay well under the bloom threshold (0.55) even through the
 * birth pulse, so the ground reads as tinted neighbourhoods, never a white wash.
 */
const PEAK = 0.2;
const CELL_CAP = 0.24;
/** The faintest a live hotspot gets, so a weak one still shows. */
const FLOOR = 0.03;
/** Time constant of the glide towards a new radius and brightness. */
const GLIDE_S = 0.8;
const FADE_IN_S = 0.8;
const FADE_OUT_S = 1;
/** A newborn scene's hotspots start at 1 + BIRTH_PULSE times their brightness, decaying with BIRTH_DECAY_S (≈ gone by 1.5 s). */
const BIRTH_PULSE = 1;
const BIRTH_DECAY_S = 0.45;
const BREATH_HZ = 0.15;
const BREATH_DEPTH = 0.12;
/** Under a scene focus, other scenes' hotspots keep this fraction of their light. */
const UNFOCUSED_LIT = 0.25;
const FOCUS_S = 0.25;
/** While dimmed (scouting), every hotspot keeps this fraction of its light. */
const DIMMED_LIT = 0.3;

type Aura = {
  scene: number;
  x: number;
  z: number;
  r: number;
  /** Radius the aura is gliding to. */
  tr: number;
  /** Fade-in/out envelope in [0, 1]. */
  opacity: number;
  /** Brightness the aura is heading to. */
  target: number;
  level: number;
  focus: number;
  rgb: Rgb;
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
 * Soft, additive glows on the ground in each scene's colour over its hotspots, the neighbourhoods where
 * it is clearly over-represented: you can see where scenes live, and watch them form, spread and fade.
 * Smoothed per (scene lineage id, cell). Growth, fades and the breath run on the pausable animation
 * clock (a pause freezes them); the focus and scout dimming are UI feedback and run in real time.
 */
export function SceneAuras({
  world, layout, frames, frame, focus, dimmed = false,
}: {
  world: World;
  layout: CityLayout;
  /** Holds the pausable animation clock. */
  frames: RefObject<FrameStore>;
  frame: Frame | null;
  focus: Focus;
  /** Turns every hotspot down, so another overlay (the scout's demand glow) reads clearly. */
  dimmed?: boolean;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const hotspots = useMemo(() => (frame ? sceneHotspots(frame, layout, world) : []), [frame, layout, world]);
  const liveScenes = useMemo(() => {
    const out = new Set<number>();
    if (frame) for (let i = 0; i < frame.scene.length; i++) if (frame.scene[i] >= 0 && frame.alive[i]) out.add(frame.scene[i]);
    return out;
  }, [frame]);
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
  /** Keyed by `${scene}:${cell}`. */
  const aurasRef = useRef(new Map<string, Aura>());
  /** Seconds since each live scene was first seen (for the birth pulse); Infinity for scenes already there. */
  const sceneAgeRef = useRef(new Map<number, number>());
  const seen = useRef<{ hotspots: typeof hotspots | null; epoch: number }>({ hotspots: null, epoch: -1 });
  const dimRef = useRef(1);
  /** Animation clock time of the last animation frame, or null before the first. */
  const lastRef = useRef<number | null>(null);
  const scratch = useMemo(() => new THREE.Matrix4(), []);

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

  useFrame((_, delta) => {
    const realDt = Math.min(1 / 15, Math.max(0, delta));
    const now = frames.current.clock.now();
    const dt = lastRef.current === null ? 0 : Math.min(1 / 15, Math.max(0, (now - lastRef.current) / 1000));
    lastRef.current = now;
    const s = seen.current;
    const auras = aurasRef.current;
    const sceneAge = sceneAgeRef.current;

    // New frame: retarget every hotspot; ones that are gone start fading out.
    if (hotspots !== s.hotspots) {
      // The first frame, and the first after a rewind or re-init, fade in without a birth pulse.
      const epoch = frame?.epoch ?? -1;
      const continuous = s.hotspots !== null && epoch === s.epoch;
      s.hotspots = hotspots;
      s.epoch = epoch;
      for (const id of sceneAge.keys()) if (!liveScenes.has(id) || !continuous) sceneAge.delete(id);
      for (const id of liveScenes) if (!sceneAge.has(id)) sceneAge.set(id, continuous ? 0 : Infinity);

      const cellLight = new Map<number, number>();
      const targets = hotspots.map((h) => {
        const target = Math.max(FLOOR, PEAK * h.strength);
        cellLight.set(h.cell, (cellLight.get(h.cell) ?? 0) + target);
        return target;
      });
      for (const a of auras.values()) a.live = false;
      hotspots.forEach((h, k) => {
        const target = targets[k] * Math.min(1, CELL_CAP / (cellLight.get(h.cell) as number));
        const r = RADIUS_PER_SPACING * layout.spacing * (1 - RADIUS_BY_STRENGTH + RADIUS_BY_STRENGTH * h.strength);
        const key = `${h.scene}:${h.cell}`;
        let a = auras.get(key);
        if (!a) {
          a = { scene: h.scene, x: h.x, z: h.z, r: r * 0.6, tr: r, opacity: 0, target, level: target, focus: 1, rgb: sceneRgb(hues, h.scene), live: true };
          auras.set(key, a);
        }
        a.live = true;
        a.target = target;
        a.rgb = sceneRgb(hues, h.scene);
        a.tr = r;
        // The first frame, a rewind or a re-init is a cut: show it at once (it may arrive while paused).
        if (!continuous) {
          a.r = r;
          a.level = target;
          a.opacity = 1;
        }
      });
      if (!continuous) for (const [key, a] of auras) if (!a.live) auras.delete(key);
    }

    for (const [id, age] of sceneAge) sceneAge.set(id, age + dt);
    const glide = 1 - Math.exp(-dt / GLIDE_S);
    const focusK = 1 - Math.exp(-realDt / FOCUS_S);
    dimRef.current += ((dimmed ? DIMMED_LIT : 1) - dimRef.current) * focusK;
    const dim = dimRef.current;
    const t = now / 1000;
    const mesh = meshRef.current;
    const tint = mesh?.geometry.getAttribute("aTint") as THREE.InstancedBufferAttribute | undefined;
    let i = 0;
    for (const [key, a] of auras) {
      if (a.live) {
        a.r += (a.tr - a.r) * glide;
        a.opacity = Math.min(1, a.opacity + dt / FADE_IN_S);
      } else {
        a.opacity -= dt / FADE_OUT_S;
        if (a.opacity <= 0) {
          auras.delete(key);
          continue;
        }
      }
      a.level += (a.target - a.level) * glide;
      const inFocus = focus?.kind !== "scene" || focus.id === a.scene;
      a.focus += ((inFocus ? 1 : UNFOCUSED_LIT) - a.focus) * focusK;
      if (!mesh || !tint || i >= MAX_AURAS) continue;
      const pulse = 1 + BIRTH_PULSE * Math.exp(-(sceneAge.get(a.scene) ?? Infinity) / BIRTH_DECAY_S);
      const breath = 1 + BREATH_DEPTH * Math.sin(t * BREATH_HZ * Math.PI * 2 + a.scene * 1.7);
      const k = a.level * a.opacity * a.focus * pulse * breath * dim;
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
