"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import type { FrameStore } from "@/render/frame-store";
import { agentHomePosition, type CityLayout, hash01 } from "@/render/layout";
import { sceneHues, sceneRgb } from "@/render/palette";
import { venueViews } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

const FIGURE_Y = 0.6;
const GLOW = 1.6;
const scratch = new THREE.Color();

type Motion = {
  fromX: Float32Array;
  fromZ: Float32Array;
  toX: Float32Array;
  toZ: Float32Array;
  curX: Float32Array;
  curZ: Float32Array;
  placed: Uint8Array;
  frame: Frame | null;
  startedAt: number;
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
    frame: null,
    startedAt: 0,
  };
}

/** One glowing figure per agent slot: each tick it eases from where it was to its venue (or home). */
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

    if (frame !== m.frame) {
      const venues = venueViews(frame, layout, world);
      const hues = sceneHues(frame.lineageParents);
      for (let i = 0; i < n; i++) {
        if (!frame.alive[i]) {
          m.placed[i] = 0;
          continue;
        }
        const v = frame.attendance[i];
        let tx: number;
        let tz: number;
        if (v >= 0 && v < venues.length) {
          const [vx, vz] = venues[v].position;
          const a = hash01(i * 3 + 1) * Math.PI * 2;
          const r = 2.2 + hash01(i * 5 + 2) * 2.5;
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
        const [r, g, b] = sceneRgb(hues, frame.scene[i]);
        mesh.setColorAt(i, scratch.setRGB(r * GLOW, g * GLOW, b * GLOW));
      }
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      m.frame = frame;
      m.startedAt = now;
    }

    const k = Math.min(1, (now - m.startedAt) / Math.max(1, tickMs * 0.85));
    const e = k * k * (3 - 2 * k);
    const arr = mesh.instanceMatrix.array as Float32Array;
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
      arr[o] = 1;
      arr[o + 5] = 1;
      arr[o + 10] = 1;
      arr[o + 12] = x;
      arr[o + 13] = FIGURE_Y + 0.15 * Math.sin(now * 0.004 + i);
      arr[o + 14] = z;
      arr[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh key={slots} ref={meshRef} args={[undefined, undefined, slots]} frustumCulled={false}>
      <sphereGeometry args={[0.45, 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
