"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { type RefObject, useEffect, useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { sceneAnchor } from "@/render/anchors";
import { diffFrames, type FrameChange } from "@/render/effects/diff";
import { EffectsDirector, type Origin } from "@/render/effects/director";
import type { ShockwaveEffect } from "@/render/effects/ShockwaveEffect";
import type { FrameStore } from "@/render/frame-store";
import type { CityLayout } from "@/render/layout";
import { type Rgb, sceneHuesOf, sceneRgb } from "@/render/palette";
import { type ClosureRules, venueViewsOf } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

const MAX_RIPPLES = 12;
const NEUTRAL: Rgb = [0.9, 0.85, 0.75];

/**
 * Runs the effects director: diffs each new frame, then feeds the shockwave effect (world → screen)
 * and draws ground ripples. The same changes go to `onChanges` (for toasts). `classify` tells the
 * player's own changes (full shockwave) from the simulation's (softer); without it, all count as the player's.
 */
export function Effects({
  world, layout, frames, shockwave, rules, onChanges, classify,
}: {
  world: World;
  /** The sim's closure rules, so the diff can tell when a venue starts struggling. */
  rules: ClosureRules;
  layout: CityLayout;
  frames: RefObject<FrameStore>;
  shockwave: ShockwaveEffect;
  /** Called once per new frame that has visible changes. */
  onChanges?: (changes: FrameChange[], frame: Frame) => void;
  /** Who caused a change. Called for each change before `onChanges` sees it. */
  classify?: (change: FrameChange, frame: Frame) => Origin;
}) {
  const director = useMemo(() => new EffectsDirector(), []);
  const lastFrame = useRef<Frame | null>(null);
  const onChangesRef = useRef(onChanges);
  const classifyRef = useRef(classify);
  useEffect(() => {
    onChangesRef.current = onChanges;
    classifyRef.current = classify;
  }, [onChanges, classify]);
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

  // Effect timers run on the pausable animation clock: a pause freezes waves mid-ring.
  useFrame(() => {
    const now = frames.current.clock.now();
    const d = director;
    const frame = frames.current.current;
    if (frame && frame !== lastFrame.current) {
      const changes = diffFrames(lastFrame.current, frame, rules);
      if (changes.length > 0) {
        const views = venueViewsOf(frame, layout, world);
        const hues = sceneHuesOf(frame.lineageParents);
        const classifyChange = classifyRef.current;
        const origins = new Map<FrameChange, Origin>(changes.map((c) => [c, classifyChange ? classifyChange(c, frame) : "player"]));
        d.ingest(changes, now, {
          venue: (slot) => views[slot]?.position ?? null,
          scene: (id) => sceneAnchor(frame, layout, id),
          sceneRgb: (id) => sceneRgb(hues, id),
          venueRgb: (slot) => {
            const s = views[slot]?.dominantScene ?? -1;
            return s >= 0 ? sceneRgb(hues, s) : NEUTRAL;
          },
        }, (c) => origins.get(c) ?? "auto");
        onChangesRef.current?.(changes, frame);
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
