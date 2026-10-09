import { agentHomePosition, type CityLayout, type XZ } from "@/render/layout";
import type { Frame } from "@/sim/frame";

/** Mean home position of a scene's living members, or null if it has none in this frame. */
export function sceneAnchor(frame: Frame, layout: CityLayout, scene: number): XZ | null {
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

/** The most common scene among living residents of a cell (ties go to the lower id), or -1. */
export function homeScene(frame: Pick<Frame, "alive" | "homeCell" | "scene">, cell: number): number {
  const counts = new Map<number, number>();
  for (let i = 0; i < frame.scene.length; i++) {
    const s = frame.scene[i];
    if (!frame.alive[i] || frame.homeCell[i] !== cell || s < 0) continue;
    counts.set(s, (counts.get(s) ?? 0) + 1);
  }
  let best = -1;
  let most = 0;
  for (const [s, k] of counts) {
    if (k > most || (k === most && s < best)) {
      most = k;
      best = s;
    }
  }
  return best;
}
