import { agentHomePosition, type CityLayout } from "@/render/layout";
import type { Frame } from "@/sim/frame";

/** Where a scene lives: the centroid of its members' homes, how far they spread (RMS), and how many there are. */
export type SceneTerritory = { id: number; x: number; z: number; spread: number; size: number };

/** One territory per scene with living members in this frame, in ascending lineage id order. */
export function sceneTerritories(frame: Pick<Frame, "alive" | "homeCell" | "scene">, layout: CityLayout): SceneTerritory[] {
  // Per scene: n, Σx, Σz, Σ(x² + z²).
  const acc = new Map<number, [number, number, number, number]>();
  for (let i = 0; i < frame.scene.length; i++) {
    const s = frame.scene[i];
    if (s < 0 || !frame.alive[i]) continue;
    const [x, z] = agentHomePosition(layout, frame.homeCell[i], i);
    let a = acc.get(s);
    if (!a) {
      a = [0, 0, 0, 0];
      acc.set(s, a);
    }
    a[0]++;
    a[1] += x;
    a[2] += z;
    a[3] += x * x + z * z;
  }
  const out: SceneTerritory[] = [];
  for (const [id, [n, sx, sz, sq]] of acc) {
    const x = sx / n;
    const z = sz / n;
    out.push({ id, x, z, spread: Math.sqrt(Math.max(0, sq / n - x * x - z * z)), size: n });
  }
  return out.sort((a, b) => a.id - b.id);
}
