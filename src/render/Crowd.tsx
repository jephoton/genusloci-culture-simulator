"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { FrameStore } from "@/render/frame-store";
import { agentHomePosition, type CityLayout, hash01, LANDMARK_RADIUS } from "@/render/layout";
import { sceneHuesOf, sceneRgb } from "@/render/palette";
import { venueViewsOf } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

const FIGURE_Y = 0.6;
const GLOW = 1.6;
/** Time constant of the colour blend towards a new scene colour. */
const BLEND_S = 0.35;

type Motion = {
  fromX: Float32Array;
  fromZ: Float32Array;
  toX: Float32Array;
  toZ: Float32Array;
  curX: Float32Array;
  curZ: Float32Array;
  placed: Uint8Array;
  /** Current (displayed) and target colours, before the pop flash. */
  curR: Float32Array;
  curG: Float32Array;
  curB: Float32Array;
  tgtR: Float32Array;
  tgtG: Float32Array;
  tgtB: Float32Array;
  /** Scene id per slot in the last frame, and when it last changed (performance.now ms). */
  scene: Int32Array;
  changedAt: Float64Array;
  frame: Frame | null;
  startedAt: number;
  last: number;
};

function createMotion(slots: number): Motion {
  return {
    fromX: new Float32Array(slots),
    fromZ: new Float32Array(slots),
    toX: new Float32Array(slots),
    toZ: new Float32Array(slots),
    curX: new Float32Array(slots),
    curZ: new Float32Array(slots),
    placed: new Uint8Array(slots),
    curR: new Float32Array(slots),
    curG: new Float32Array(slots),
    curB: new Float32Array(slots),
    tgtR: new Float32Array(slots),
    tgtG: new Float32Array(slots),
    tgtB: new Float32Array(slots),
    scene: new Int32Array(slots).fill(-1),
    changedAt: new Float64Array(slots).fill(-Infinity),
    frame: null,
    startedAt: 0,
    last: 0,
  };
}

/**
 * One glowing figure per agent slot: each tick it eases from where it was to its venue (or home).
 * Colours blend towards the agent's scene colour; an agent that switches scene pops and flashes white.
 */
export function Crowd({
  world, layout, frames, slots, tickMs,
}: {
  world: World;
  layout: CityLayout;
  frames: RefObject<FrameStore>;
  slots: number;
  tickMs: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const motion = useRef<Motion | null>(null);

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < slots; i++) {
      mesh.setMatrixAt(i, hidden);
      mesh.setColorAt(i, black);
    }
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceColor?.setUsage(THREE.DynamicDrawUsage);
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    motion.current = createMotion(slots);
  }, [slots]);

  useFrame(() => {
    const mesh = meshRef.current;
    const m = motion.current;
    const frame = frames.current.current;
    if (!mesh || !m || !frame) return;
    const now = performance.now();
    const n = Math.min(slots, frame.alive.length);

    const dt = Math.min(0.1, Math.max(0, (now - m.last) / 1000));
    m.last = now;

    if (frame !== m.frame) {
      // The first frame and any epoch change (init, rewind) snap colours with no pops.
      const snap = m.frame === null || m.frame.epoch !== frame.epoch;
      const venues = venueViewsOf(frame, layout, world);
      const hues = sceneHuesOf(frame.lineageParents);
      for (let i = 0; i < n; i++) {
        if (!frame.alive[i]) {
          m.placed[i] = 0;
          m.scene[i] = -1;
          m.changedAt[i] = -Infinity;
          continue;
        }
        const [cr, cg, cb] = sceneRgb(hues, frame.scene[i]);
        m.tgtR[i] = cr * GLOW;
        m.tgtG[i] = cg * GLOW;
        m.tgtB[i] = cb * GLOW;
        if (snap || !m.placed[i]) {
          m.curR[i] = m.tgtR[i];
          m.curG[i] = m.tgtG[i];
          m.curB[i] = m.tgtB[i];
          m.changedAt[i] = -Infinity;
        } else if (m.scene[i] !== frame.scene[i]) {
          m.changedAt[i] = now;
        }
        m.scene[i] = frame.scene[i];
        const v = frame.attendance[i];
        let tx: number;
        let tz: number;
        if (v >= 0 && v < venues.length) {
          const { position: [vx, vz], kind, scale } = venues[v];
          const a = hash01(i * 3 + 1) * Math.PI * 2;
          // Stand just outside the landmark body, whatever its size.
          const r = scale * LANDMARK_RADIUS[kind] + 1 + hash01(i * 5 + 2) * 2;
          tx = vx + r * Math.cos(a);
          tz = vz + r * Math.sin(a);
        } else {
          [tx, tz] = agentHomePosition(layout, frame.homeCell[i], i);
        }
        if (!m.placed[i]) {
          m.curX[i] = tx;
          m.curZ[i] = tz;
          m.placed[i] = 1;
        }
        m.fromX[i] = m.curX[i];
        m.fromZ[i] = m.curZ[i];
        m.toX[i] = tx;
        m.toZ[i] = tz;
      }
      m.frame = frame;
      m.startedAt = now;
    }

    const k = Math.min(1, (now - m.startedAt) / Math.max(1, tickMs * 0.85));
    const e = k * k * (3 - 2 * k);
    const blend = 1 - Math.exp(-dt / BLEND_S);
    const arr = mesh.instanceMatrix.array as Float32Array;
    const col = mesh.instanceColor;
    for (let i = 0; i < n; i++) {
      const o = i * 16;
      if (!frame.alive[i]) {
        arr[o] = 0;
        arr[o + 5] = 0;
        arr[o + 10] = 0;
        continue;
      }
      const x = m.fromX[i] + (m.toX[i] - m.fromX[i]) * e;
      const z = m.fromZ[i] + (m.toZ[i] - m.fromZ[i]) * e;
      m.curX[i] = x;
      m.curZ[i] = z;
      m.curR[i] += (m.tgtR[i] - m.curR[i]) * blend;
      m.curG[i] += (m.tgtG[i] - m.curG[i]) * blend;
      m.curB[i] += (m.tgtB[i] - m.curB[i]) * blend;
      const since = now - m.changedAt[i];
      const pop = 1 + 1.2 * Math.exp(-since / 220);
      const flash = 1.5 * Math.exp(-since / 160);
      col?.setXYZ(i, m.curR[i] + flash, m.curG[i] + flash, m.curB[i] + flash);
      arr[o] = pop;
      arr[o + 5] = pop;
      arr[o + 10] = pop;
      arr[o + 12] = x;
      arr[o + 13] = FIGURE_Y + 0.15 * Math.sin(now * 0.004 + i);
      arr[o + 14] = z;
      arr[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (col) col.needsUpdate = true;
  });

  return (
    <instancedMesh key={slots} ref={meshRef} args={[undefined, undefined, slots]} frustumCulled={false}>
      <sphereGeometry args={[0.45, 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
