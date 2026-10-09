"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useRef } from "react";
import type * as THREE from "three";

/** A camera flight request: look at (x, 0, z). `at` (performance.now ms) identifies the request. */
export type FlyTo = { x: number; z: number; at: number };

/** The parts of drei's MapControls this needs (it is the default controls, so `useThree` has it). */
type Controls = THREE.EventDispatcher<{ start: object }> & { target: THREE.Vector3 };

const FLY_MS = 900;
const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

type Flight = { at: number; fromX: number; fromZ: number; dx: number; dz: number; camX: number; camZ: number; target: number };

/**
 * Flies the view to the latest `flyTo` request over about 900 ms: eases the MapControls target to the
 * point and moves the camera by the same amount, so the viewing angle and distance stay the same.
 * Starting a drag cancels the flight.
 */
export function CameraDirector({ flyTo }: { flyTo: RefObject<FlyTo | null> }) {
  const controls = useThree((s) => s.controls) as Controls | null;
  const camera = useThree((s) => s.camera);
  const flight = useRef<Flight | null>(null);
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
        camX: camera.position.x - t.x,
        camZ: camera.position.z - t.z,
        target: t.y,
      };
    }
    const f = flight.current;
    if (!f) return;
    const k = Math.min(1, (performance.now() - f.at) / FLY_MS);
    const e = ease(k);
    const x = f.fromX + f.dx * e;
    const z = f.fromZ + f.dz * e;
    // Ease the target's height to the ground too, carrying the camera with it.
    const y = f.target * (1 - e);
    camera.position.set(x + f.camX, camera.position.y - (controls.target.y - y), z + f.camZ);
    controls.target.set(x, y, z);
    if (k >= 1) flight.current = null;
  });

  return null;
}
