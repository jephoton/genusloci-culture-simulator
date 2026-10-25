"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { prefersReducedMotion } from "@/render/motion";

/**
 * A camera flight request: look at (x, 0, z), optionally from `distance` away (same viewing angle).
 * `at` (performance.now ms) identifies the request.
 */
export type FlyTo = { x: number; z: number; at: number; distance?: number };

/** The parts of drei's MapControls this needs (it is the default controls, so `useThree` has it). */
type Controls = THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3 };

const FLY_MS = 900;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

type Flight = { at: number; fromX: number; fromZ: number; dx: number; dz: number; offset: THREE.Vector3; from: number; to: number; target: number };

/**
 * Flies the view to the latest `flyTo` request over about 900 ms: eases the MapControls target to the
 * point and moves the camera with it, keeping the viewing angle (and the distance, unless one is asked for).
 * Starting a drag cancels the flight.
 */
export function CameraDirector({ flyTo }: { flyTo: RefObject<FlyTo | null> }) {
  const controls = useThree((s) => s.controls) as Controls | null;
  const camera = useThree((s) => s.camera);
  const flight = useRef<Flight | null>(null);
  const [reduced] = useState(prefersReducedMotion);
  /** The last request handled (started or cancelled), so each is flown once. */
  const handled = useRef(-1);

  useEffect(() => {
    if (!controls) return;
    const cancel = () => {
      flight.current = null;
    };
    controls.addEventListener("start", cancel);
    return () => controls.removeEventListener("start", cancel);
  }, [controls]);

  useFrame(() => {
    const req = flyTo.current;
    if (!controls) return;
    if (req && req.at !== handled.current) {
      handled.current = req.at;
      const t = controls.target;
      flight.current = {
        at: performance.now(),
        fromX: t.x,
        fromZ: t.z,
        dx: req.x - t.x,
        dz: req.z - t.z,
        offset: camera.position.clone().sub(t).normalize(),
        from: camera.position.distanceTo(t),
        to: req.distance ?? camera.position.distanceTo(t),
        target: t.y,
      };
    }
    const f = flight.current;
    if (!f) return;
    // Reduced motion jumps straight there.
    const k = reduced ? 1 : Math.min(1, (performance.now() - f.at) / FLY_MS);
    const e = ease(k);
    const x = f.fromX + f.dx * e;
    const z = f.fromZ + f.dz * e;
    // Ease the target's height to the ground too, carrying the camera with it.
    const y = f.target * (1 - e);
    const d = f.from + (f.to - f.from) * e;
    camera.position.set(x + f.offset.x * d, y + f.offset.y * d, z + f.offset.z * d);
    controls.target.set(x, y, z);
    if (k >= 1) flight.current = null;
  });

  return null;
}
