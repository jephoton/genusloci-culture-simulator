"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { diffFrames } from "@/render/effects/diff";
import { EffectsDirector } from "@/render/effects/director";
import type { ShockwaveEffect } from "@/render/effects/ShockwaveEffect";
import type { FrameStore } from "@/render/frame-store";
import { agentHomePosition, type CityLayout } from "@/render/layout";
import { type Rgb, sceneHuesOf, sceneRgb } from "@/render/palette";
import { venueViewsOf } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

const MAX_RIPPLES = 12;
const NEUTRAL: Rgb = [0.9, 0.85, 0.75];

/** Mean home position of a scene's members (computed only when a scene event needs an anchor). */
function sceneAnchor(frame: Frame, layout: CityLayout, scene: number): [number, number] | null {
  let x = 0;
  let z = 0;
  let n = 0;
  for (let i = 0; i < frame.scene.length; i++) {
    if (frame.scene[i] !== scene || !frame.alive[i]) continue;
    const [hx, hz] = agentHomePosition(layout, frame.homeCell[i], i);
    x += hx;
    z += hz;
    n++;
  }
  return n > 0 ? [x / n, z / n] : null;
}

/**
 * Runs the effects director: diffs each new frame, then feeds the shockwave effect (world → screen)
 * and draws ground ripples.
 */
export function Effects({
  world, layout, frames, shockwave,
}: {
  world: World;
  layout: CityLayout;
  frames: RefObject<FrameStore>;
  shockwave: ShockwaveEffect;
}) {
  const director = useMemo(() => new EffectsDirector(), []);
  const lastFrame = useRef<Frame | null>(null);
  const ripplesRef = useRef<THREE.InstancedMesh>(null);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);
  const scratch = useMemo(() => ({ v: new THREE.Vector3(), m: new THREE.Matrix4(), c: new THREE.Color() }), []);
  const ring = useMemo(() => new THREE.RingGeometry(0.92, 1, 64).rotateX(-Math.PI / 2), []);

  useEffect(() => () => ring.dispose(), [ring]);

  useLayoutEffect(() => {
    const mesh = ripplesRef.current;
    if (!mesh) return;
    const hidden = new THREE.Matrix4().makeScale(0, 0, 0);
    const black = new THREE.Color(0, 0, 0);
    for (let i = 0; i < MAX_RIPPLES; i++) {
      mesh.setMatrixAt(i, hidden);
      mesh.setColorAt(i, black);
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useFrame(() => {
    const now = performance.now();
    const d = director;
    const frame = frames.current.current;
    if (frame && frame !== lastFrame.current) {
      const changes = diffFrames(lastFrame.current, frame);
      if (changes.length > 0) {
        const views = venueViewsOf(frame, layout, world);
        const hues = sceneHuesOf(frame.lineageParents);
        d.ingest(changes, now, {
          venue: (slot) => views[slot]?.position ?? null,
          scene: (id) => sceneAnchor(frame, layout, id),
          sceneRgb: (id) => sceneRgb(hues, id),
          venueRgb: (slot) => {
            const s = views[slot]?.dominantScene ?? -1;
            return s >= 0 ? sceneRgb(hues, s) : NEUTRAL;
          },
        });
      }
      lastFrame.current = frame;
    }
    d.prune(now);

    shockwave.setAspect(size.width / Math.max(1, size.height));
    shockwave.setWaves(
      d.waves.map((w) => {
        const p = scratch.v.set(w.x, 0, w.z).project(camera);
        return { u: p.x * 0.5 + 0.5, v: p.y * 0.5 + 0.5, progress: d.progress(w, now), strength: p.z < 1 ? w.strength : 0 };
      }),
    );
    const [sx, sy] = d.shake(now);
    shockwave.setShake(sx, sy);

    const mesh = ripplesRef.current;
    if (!mesh) return;
    for (let i = 0; i < MAX_RIPPLES; i++) {
      const r = d.ripples[i];
      if (!r) {
        mesh.setMatrixAt(i, scratch.m.makeScale(0, 0, 0));
        continue;
      }
      const t = d.progress(r, now);
      const radius = 1 + r.radius * (1 - (1 - t) * (1 - t));
      scratch.m.makeScale(radius, 1, radius).setPosition(r.x, 0.12, r.z);
      mesh.setMatrixAt(i, scratch.m);
      const fade = (1 - t) * 2.2;
      mesh.setColorAt(i, scratch.c.setRGB(r.rgb[0] * fade, r.rgb[1] * fade, r.rgb[2] * fade));
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={ripplesRef} args={[ring, undefined, MAX_RIPPLES]} frustumCulled={false}>
      <meshBasicMaterial toneMapped={false} transparent depthWrite={false} blending={THREE.AdditiveBlending} />
    </instancedMesh>
  );
}
