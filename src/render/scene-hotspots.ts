import type { CityLayout } from "@/render/layout";
import type { Frame } from "@/sim/frame";
import type { World } from "@/world/schema";

/** A cell is a scene's hotspot when the scene's share of its residents is at least this × its citywide share... */
export const HOTSPOT_MIN_RATIO = 2;
/** ...and at least this many of its residents belong to the scene. */
export const HOTSPOT_MIN_MEMBERS = 8;
/** Only a scene's strongest hotspots are kept, so a sprawling scene still points at its core. */
export const MAX_HOTSPOTS_PER_SCENE = 4;
/** Over-representation at which a hotspot's excess term reaches full strength. */
const FULL_RATIO = 3;

/**
 * A neighbourhood where a scene clusters: the cell, its centre, and a strength in (0, 1] that grows with
 * over-representation (ratio of local to citywide share, full at FULL_RATIO) and with sqrt(members),
 * relative to the most-populated hotspot.
 */
export type SceneHotspot = { scene: number; cell: number; x: number; z: number; strength: number };

/** Every live scene's strongest hotspots (at most MAX_HOTSPOTS_PER_SCENE each), ordered by scene lineage id, then cell. */
export function sceneHotspots(
  frame: Pick<Frame, "alive" | "homeCell" | "scene">,
  layout: Pick<CityLayout, "cellX" | "cellZ">,
  world: Pick<World, "cells">,
): SceneHotspot[] {
  const nCells = world.cells.length;
  const residents = new Int32Array(nCells);
  /** Per scene: members per cell. */
  const members = new Map<number, Int32Array>();
  const sceneTotal = new Map<number, number>();
  let population = 0;
  for (let i = 0; i < frame.alive.length; i++) {
    if (!frame.alive[i]) continue;
    const c = frame.homeCell[i];
    residents[c]++;
    population++;
    const s = frame.scene[i];
    if (s < 0) continue;
    let row = members.get(s);
    if (!row) {
      row = new Int32Array(nCells);
      members.set(s, row);
    }
    row[c]++;
    sceneTotal.set(s, (sceneTotal.get(s) ?? 0) + 1);
  }

  type Candidate = { cell: number; n: number; excess: number };
  const perScene: [number, Candidate[]][] = [];
  let largest = 0;
  for (const s of [...members.keys()].sort((a, b) => a - b)) {
    const row = members.get(s) as Int32Array;
    const share = (sceneTotal.get(s) as number) / population;
    const found: Candidate[] = [];
    for (let c = 0; c < nCells; c++) {
      const n = row[c];
      if (n < HOTSPOT_MIN_MEMBERS) continue;
      const ratio = n / residents[c] / share;
      if (ratio >= HOTSPOT_MIN_RATIO) found.push({ cell: c, n, excess: Math.min(1, (ratio - 1) / (FULL_RATIO - 1)) });
    }
    const kept = found
      .sort((a, b) => b.excess * Math.sqrt(b.n) - a.excess * Math.sqrt(a.n) || a.cell - b.cell)
      .slice(0, MAX_HOTSPOTS_PER_SCENE)
      .sort((a, b) => a.cell - b.cell);
    for (const k of kept) largest = Math.max(largest, k.n);
    perScene.push([s, kept]);
  }
  return perScene.flatMap(([scene, kept]) =>
    kept.map(({ cell, n, excess }) => ({
      scene,
      cell,
      x: layout.cellX[cell],
      z: layout.cellZ[cell],
      strength: excess * Math.sqrt(n / largest),
    })),
  );
}
