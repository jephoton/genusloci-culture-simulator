"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { alongRoute, ease, FIGURE_Y, JOIN, RACE_GLOW, RACE_SIZE, type Route, routeOf, type Streets } from "@/render/Crowd";
import { RACE_RGB } from "@/render/focus";
import type { FrameStore } from "@/render/frame-store";
import { agentHomePosition, type CityLayout, hash01, LANDMARK_RADIUS } from "@/render/layout";
import { outingPhase, staggerOf } from "@/render/outing-path";
import { RouteBook } from "@/render/routes";
import { venueViewsOf } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

/** More extra walkers than any race night needs (each venue draws tens of people at most). */
const CAPACITY = 1500;

type Walker = { agent: number; k: number; homeX: number; homeZ: number; spotX: number; spotZ: number; route: Route; stagger: number };

/**
 * In a venue race many residents go to the event in more than one future, but `Crowd` draws each
 * resident once (at `race.group`). This adds a walker in the venue's colour for each other venue a
 * resident went to (`race.went`), on the same night-out timing, so each venue shows its exact count.
 */
export function RaceWalkers({ world, layout, frames, tickMs }: {
  world: World;
  layout: CityLayout;
  frames: RefObject<FrameStore>;
  tickMs: number;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const state = useRef<{ frame: Frame | null; walkers: Walker[]; startedAt: number; streets: Streets | null }>({ frame: null, walkers: [], startedAt: 0, streets: null });

  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh) return;
    // Create the colour buffer before the first render so the material compiles with instance colours.
    const black = new THREE.Color(0, 0, 0);
    for (let j = 0; j < CAPACITY; j++) mesh.setColorAt(j, black);
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }, []);

  useFrame(() => {
    const mesh = meshRef.current;
    const frame = frames.current.current;
    if (!mesh || !frame) return;
    const s = state.current;
    const now = frames.current.clock.now();
    if (frame !== s.frame) {
      s.frame = frame;
      s.startedAt = now;
      s.walkers = [];
      const race = frame.race;
      if (race) {
        if (!s.streets || s.streets.graph !== layout.graph) s.streets = { graph: layout.graph, book: new RouteBook(layout.graph), routes: new Map() };
        const venues = venueViewsOf(frame, layout, world);
        for (let i = 0; i < race.went.length && s.walkers.length < CAPACITY; i++) {
          const extra = race.went[i] & ~(race.group[i] >= 0 ? 1 << race.group[i] : 0);
          if (!extra) continue;
          const [hx, hz] = agentHomePosition(layout, frame.homeCell[i], i);
          for (let k = 0; k < race.hosts.length; k++) {
            const venue = venues[race.hosts[k]];
            if (!(extra & (1 << k)) || !venue) continue;
            const { position: [vx, vz], kind, scale } = venue;
            // A different spot and departure time from the resident's own dot, so the two don't move in step.
            const seed = i * 13 + k * 7919;
            const a = hash01(seed + 1) * Math.PI * 2;
            const r = scale * LANDMARK_RADIUS[kind] + 1 + hash01(seed + 2) * 2;
            s.walkers.push({ agent: i, k, homeX: hx, homeZ: hz, spotX: vx + r * Math.cos(a), spotZ: vz + r * Math.sin(a), route: routeOf(s.streets, hx, hz, vx, vz), stagger: staggerOf(seed) });
          }
        }
      }
      const col = new THREE.Color();
      s.walkers.forEach((w, j) => {
        const [r, g, b] = RACE_RGB[w.k];
        mesh.setColorAt(j, col.setRGB(r * RACE_GLOW, g * RACE_GLOW, b * RACE_GLOW));
      });
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      mesh.count = s.walkers.length;
    }
    if (!s.walkers.length) return;
    const t = Math.min(1, (now - s.startedAt) / Math.max(1, tickMs));
    const arr = mesh.instanceMatrix.array as Float32Array;
    s.walkers.forEach((w, j) => {
      const { out, back } = outingPhase(t, w.stagger);
      let x: number;
      let z: number;
      if (back > 0) {
        [x, z] = alongRoute(w.route, w.spotX, w.spotZ, 1 - ease(back));
        const k = ease(Math.max(0, (back - (1 - JOIN)) / JOIN));
        x += (w.homeX - x) * k;
        z += (w.homeZ - z) * k;
      } else {
        [x, z] = alongRoute(w.route, w.spotX, w.spotZ, ease(out));
        const k = ease(Math.min(1, out / JOIN));
        x = w.homeX + (x - w.homeX) * k;
        z = w.homeZ + (z - w.homeZ) * k;
      }
      // Stay hidden at home until leaving and after getting back, so only the walk shows.
      const size = out > 0 && back < 1 ? RACE_SIZE : 0;
      const o = j * 16;
      arr.fill(0, o, o + 16);
      arr[o] = size;
      arr[o + 5] = size;
      arr[o + 10] = size;
      arr[o + 12] = x;
      arr[o + 13] = FIGURE_Y + 0.15 * Math.sin(now * 0.004 + w.agent + w.k);
      arr[o + 14] = z;
      arr[o + 15] = 1;
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, CAPACITY]} frustumCulled={false}>
      <sphereGeometry args={[0.28, 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
