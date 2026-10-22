"use client";

import { useFrame } from "@react-three/fiber";
import { type RefObject, useEffect, useLayoutEffect, useRef } from "react";
import * as THREE from "three";
import { agentInFocus, type Focus } from "@/render/focus";
import { markVisualComplete, type FrameStore } from "@/render/frame-store";
import { agentHomePosition, type CityLayout, hash01, LANDMARK_RADIUS } from "@/render/layout";
import { outingPhase, staggerOf } from "@/render/outing-path";
import { sceneHuesOf, sceneRgb } from "@/render/palette";
import { nearestNode, RouteBook, routePolyline, samplePolyline } from "@/render/routes";
import { venueViewsOf } from "@/render/venues";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

const FIGURE_Y = 0.6;
const GLOW = 0.85;
/** Time constant of the colour blend towards a new scene colour. */
const BLEND_S = 0.35;
/** Agents who stay in adopt their new colour at this phase of the week. */
const STAY_COMMIT_AT = 0.5;
const ease = (k: number) => k * k * (3 - 2 * k);
/** Fraction of a leg spent blending between the agent's own position (or home) and the street route. */
const JOIN = 0.1;
/** The route cache is dropped when it grows past this many routes; routes rebuild lazily. */
const MAX_ROUTES = 20_000;
/** Under a focus, agents outside it keep this fraction of their brightness. */
const UNFOCUSED_LIT = 0.025;
/** Under a focus, agents in it are drawn this much larger. */
const FOCUSED_SIZE = 1.3;
/** Time constant of the fade into and out of focus. */
const FOCUS_S = 0.2;

type Route = { poly: Float32Array; cum: Float32Array; total: number };
/** One route book per layout, plus the street routes (home node → venue node) built on it. */
type Streets = { graph: CityLayout["graph"]; book: RouteBook; routes: Map<string, Route> };

/**
 * Street route from the road node nearest home to the road node nearest the venue, shared by every
 * agent of the same block heading to the same venue (one shortest-path tree per venue). Each agent
 * walks on from its end to its own spot by the venue (see `alongRoute`).
 */
function routeOf(streets: Streets, hx: number, hz: number, vx: number, vz: number): Route {
  const g = streets.graph;
  const start = nearestNode(g, hx, hz);
  const end = nearestNode(g, vx, vz);
  const key = `${start}|${end}`;
  let route = streets.routes.get(key);
  if (!route) {
    const poly = start >= 0 && end >= 0
      ? routePolyline(streets.book, [g.nodeX[start], g.nodeZ[start]], [g.nodeX[end], g.nodeZ[end]])
      : Float32Array.from([hx, hz, vx, vz]);
    route = { poly, ...samplePolyline.prepare(poly) };
    if (streets.routes.size >= MAX_ROUTES) streets.routes.clear();
    streets.routes.set(key, route);
  }
  return route;
}

/** Point at fraction f of the walk along `route` and then straight on to the spot (sx, sz), by arc length. */
function alongRoute(route: Route, sx: number, sz: number, f: number): [number, number] {
  const { poly } = route;
  const ex = poly[poly.length - 2];
  const ez = poly[poly.length - 1];
  const hop = Math.hypot(sx - ex, sz - ez);
  const d = f * (route.total + hop);
  if (d <= route.total) return samplePolyline.at(poly, route.cum, route.total > 0 ? d / route.total : 0);
  const k = hop > 0 ? (d - route.total) / hop : 1;
  return [ex + (sx - ex) * k, ez + (sz - ez) * k];
}

type Motion = {
  /** Where the agent was when this week's frame arrived (normally home). */
  fromX: Float32Array;
  fromZ: Float32Array;
  /** Venue spot this week (only meaningful when going). */
  venueX: Float32Array;
  venueZ: Float32Array;
  homeX: Float32Array;
  homeZ: Float32Array;
  going: Uint8Array;
  /** Street route this week (only meaningful when going). */
  route: (Route | null)[];
  stagger: Float32Array;
  curX: Float32Array;
  curZ: Float32Array;
  placed: Uint8Array;
  /** The new scene colour waits until the agent arrives (or mid-week if staying in). */
  pending: Uint8Array;
  pendingChanged: Uint8Array;
  nextR: Float32Array;
  nextG: Float32Array;
  nextB: Float32Array;
  /** Current (displayed) and target colours, before the pop flash. */
  curR: Float32Array;
  curG: Float32Array;
  curB: Float32Array;
  tgtR: Float32Array;
  tgtG: Float32Array;
  tgtB: Float32Array;
  /** Scene id per slot in the last frame, and when it last changed (animation clock ms). */
  scene: Int32Array;
  changedAt: Float64Array;
  /** Brightness (1 = full) and emphasis (0–1, towards FOCUSED_SIZE) under the current focus, eased. */
  lit: Float32Array;
  emphasis: Float32Array;
  frame: Frame | null;
  /** Animation clock time this tick's night out started, and of the last animation frame. */
  startedAt: number;
  last: number;
  /** Real time of the last animation frame: focus fades are UI feedback and run even while paused. */
  lastReal: number;
};

function createMotion(slots: number): Motion {
  return {
    fromX: new Float32Array(slots),
    fromZ: new Float32Array(slots),
    venueX: new Float32Array(slots),
    venueZ: new Float32Array(slots),
    homeX: new Float32Array(slots),
    homeZ: new Float32Array(slots),
    going: new Uint8Array(slots),
    route: new Array<Route | null>(slots).fill(null),
    stagger: Float32Array.from({ length: slots }, (_, i) => staggerOf(i)),
    curX: new Float32Array(slots),
    curZ: new Float32Array(slots),
    placed: new Uint8Array(slots),
    pending: new Uint8Array(slots),
    pendingChanged: new Uint8Array(slots),
    nextR: new Float32Array(slots),
    nextG: new Float32Array(slots),
    nextB: new Float32Array(slots),
    curR: new Float32Array(slots),
    curG: new Float32Array(slots),
    curB: new Float32Array(slots),
    tgtR: new Float32Array(slots),
    tgtG: new Float32Array(slots),
    tgtB: new Float32Array(slots),
    scene: new Int32Array(slots).fill(-1),
    changedAt: new Float64Array(slots).fill(-Infinity),
    lit: new Float32Array(slots).fill(1),
    emphasis: new Float32Array(slots),
    frame: null,
    startedAt: 0,
    last: 0,
    lastReal: 0,
  };
}

/**
 * One glowing figure per agent slot. Each tick (a day in the demo) plays as a night out: agents leave home in
 * staggered waves, walk the streets to their venue, gather there, then walk home the same way. A
 * changed scene colour is adopted when the agent arrives at the venue where it changed (or mid-week
 * if it stayed in), with a pop and a flash. Under a focus, agents outside it fade nearly to black and
 * those in it grow a little. Everything but the focus fade runs on the pausable animation clock, so a
 * pause freezes walkers mid-step; a frame that arrives while paused starts its night out at the frozen
 * time, so nobody moves until play resumes.
 */
export function Crowd({
  world, layout, frames, slots, tickMs, focus,
}: {
  world: World;
  layout: CityLayout;
  frames: RefObject<FrameStore>;
  slots: number;
  tickMs: number;
  focus: Focus;
}) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const focusRef = useRef<Focus>(focus);
  useEffect(() => {
    focusRef.current = focus;
  }, [focus]);
  const motion = useRef<Motion | null>(null);
  const streetsRef = useRef<Streets | null>(null);

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
    const now = frames.current.clock.now();
    const real = performance.now();
    const n = Math.min(slots, frame.alive.length);

    const dt = Math.min(0.1, Math.max(0, (now - m.last) / 1000));
    m.last = now;
    const realDt = Math.min(0.1, Math.max(0, (real - m.lastReal) / 1000));
    m.lastReal = real;

    if (frame !== m.frame) {
      let streets = streetsRef.current;
      if (!streets || streets.graph !== layout.graph) {
        streets = { graph: layout.graph, book: new RouteBook(layout.graph), routes: new Map() };
        streetsRef.current = streets;
      }
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
        const changed = m.scene[i] !== frame.scene[i];
        m.scene[i] = frame.scene[i];
        if (snap || !m.placed[i]) {
          m.curR[i] = m.tgtR[i] = cr * GLOW;
          m.curG[i] = m.tgtG[i] = cg * GLOW;
          m.curB[i] = m.tgtB[i] = cb * GLOW;
          m.changedAt[i] = -Infinity;
          m.pending[i] = 0;
        } else {
          m.nextR[i] = cr * GLOW;
          m.nextG[i] = cg * GLOW;
          m.nextB[i] = cb * GLOW;
          m.pending[i] = 1;
          m.pendingChanged[i] = changed ? 1 : 0;
        }
        const [hx, hz] = agentHomePosition(layout, frame.homeCell[i], i);
        m.homeX[i] = hx;
        m.homeZ[i] = hz;
        const v = frame.attendance[i];
        m.going[i] = v >= 0 && v < venues.length ? 1 : 0;
        if (m.going[i]) {
          const { position: [vx, vz], kind, scale } = venues[v];
          const a = hash01(i * 3 + 1) * Math.PI * 2;
          // Stand just outside the landmark body, whatever its size.
          const r = scale * LANDMARK_RADIUS[kind] + 1 + hash01(i * 5 + 2) * 2;
          m.venueX[i] = vx + r * Math.cos(a);
          m.venueZ[i] = vz + r * Math.sin(a);
          m.route[i] = routeOf(streets, hx, hz, vx, vz);
        } else {
          m.route[i] = null;
        }
        if (!m.placed[i] || snap) {
          m.curX[i] = hx;
          m.curZ[i] = hz;
          m.placed[i] = 1;
        }
        m.fromX[i] = m.curX[i];
        m.fromZ[i] = m.curZ[i];
      }
      m.frame = frame;
      m.startedAt = now;
    }

    const t = Math.min(1, (now - m.startedAt) / Math.max(1, tickMs));
    const blend = 1 - Math.exp(-dt / BLEND_S);
    const focusBlend = 1 - Math.exp(-realDt / FOCUS_S);
    const f = focusRef.current;
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
      let x: number;
      let z: number;
      let arrived: boolean;
      const route = m.route[i];
      if (m.going[i] && route) {
        const { out, back } = outingPhase(t, m.stagger[i]);
        if (back > 0) {
          // Walk the route backwards, then step off it to the front door.
          [x, z] = alongRoute(route, m.venueX[i], m.venueZ[i], 1 - ease(back));
          const k = ease(Math.max(0, (back - (1 - JOIN)) / JOIN));
          x += (m.homeX[i] - x) * k;
          z += (m.homeZ[i] - z) * k;
        } else {
          // Blend from wherever the agent was into the route, so a rewind or late frame never snaps.
          [x, z] = alongRoute(route, m.venueX[i], m.venueZ[i], ease(out));
          const k = ease(Math.min(1, out / JOIN));
          x = m.fromX[i] + (x - m.fromX[i]) * k;
          z = m.fromZ[i] + (z - m.fromZ[i]) * k;
        }
        arrived = out >= 1;
      } else {
        const e = ease(Math.min(1, t / 0.3));
        x = m.fromX[i] + (m.homeX[i] - m.fromX[i]) * e;
        z = m.fromZ[i] + (m.homeZ[i] - m.fromZ[i]) * e;
        arrived = t >= STAY_COMMIT_AT;
      }
      if (m.pending[i] && arrived) {
        m.tgtR[i] = m.nextR[i];
        m.tgtG[i] = m.nextG[i];
        m.tgtB[i] = m.nextB[i];
        if (m.pendingChanged[i]) m.changedAt[i] = now;
        m.pending[i] = 0;
      }
      m.curX[i] = x;
      m.curZ[i] = z;
      m.curR[i] += (m.tgtR[i] - m.curR[i]) * blend;
      m.curG[i] += (m.tgtG[i] - m.curG[i]) * blend;
      m.curB[i] += (m.tgtB[i] - m.curB[i]) * blend;
      const since = now - m.changedAt[i];
      const pop = 1 + 1.2 * Math.exp(-since / 220);
      const flash = 1.5 * Math.exp(-since / 160);
      const member = agentInFocus(f, frame.scene[i], frame.attendance[i], i);
      m.lit[i] += ((member ? 1 : UNFOCUSED_LIT) - m.lit[i]) * focusBlend;
      m.emphasis[i] += ((f && member ? 1 : 0) - m.emphasis[i]) * focusBlend;
      const lit = m.lit[i];
      col?.setXYZ(i, (m.curR[i] + flash) * lit, (m.curG[i] + flash) * lit, (m.curB[i] + flash) * lit);
      const size = pop * (1 + (FOCUSED_SIZE - 1) * m.emphasis[i]);
      arr[o] = size;
      arr[o + 5] = size;
      arr[o + 10] = size;
      arr[o + 12] = x;
      arr[o + 13] = FIGURE_Y + 0.15 * Math.sin(now * 0.004 + i);
      arr[o + 14] = z;
      arr[o + 15] = 1;
    }
    mesh.instanceMatrix.needsUpdate = true;
    if (col) col.needsUpdate = true;
    if (t >= 1) markVisualComplete(frames.current, frame);
  });

  return (
    <instancedMesh key={slots} ref={meshRef} args={[undefined, undefined, slots]} frustumCulled={false}>
      <sphereGeometry args={[0.28, 8, 6]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
