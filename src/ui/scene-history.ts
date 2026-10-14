import type { SimDigest } from "@/sim/digest";

export type SizePoint = { tick: number; size: number };
export type SceneHistory = ReadonlyMap<number, readonly SizePoint[]>;

/** Points kept per scene. */
const MAX_POINTS = 60;

/**
 * Adds a digest's scene sizes to the history. A digest earlier than what's recorded (a rewind) first
 * drops the points after it, so the history always describes the timeline being shown.
 */
export function recordSizes(history: SceneHistory, digest: SimDigest): SceneHistory {
  const next = new Map<number, SizePoint[]>();
  for (const [id, points] of history) {
    const kept = points.filter((p) => p.tick < digest.tick);
    if (kept.length > 0) next.set(id, kept);
  }
  for (const s of digest.scenes) {
    const points = next.get(s.id) ?? [];
    points.push({ tick: digest.tick, size: s.size });
    next.set(s.id, points.slice(-MAX_POINTS));
  }
  return next;
}

/** SVG polyline points for a size series in a w × h box (y grows downwards). */
export function sparkPoints(points: readonly SizePoint[], w: number, h: number): string {
  if (points.length === 0) return "";
  const t0 = points[0].tick;
  const t1 = points[points.length - 1].tick;
  const max = Math.max(1, ...points.map((p) => p.size));
  return points
    .map((p) => {
      const x = t1 > t0 ? ((p.tick - t0) / (t1 - t0)) * w : w;
      const y = h - (p.size / max) * h;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}
