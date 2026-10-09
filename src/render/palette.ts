const GOLDEN_ANGLE = 137.508;

export type Rgb = [number, number, number];
export const UNASSIGNED_RGB: Rgb = [0.55, 0.57, 0.62];

/**
 * Hue in degrees per lineage id. Roots are spread by the golden angle. Children are offset from their
 * parent by ±24°, ±32°, … in birth order, so related scenes look related.
 */
export function sceneHues(parents: ArrayLike<number>): Float32Array {
  const hues = new Float32Array(parents.length);
  const children = new Map<number, number>();
  for (let id = 0; id < parents.length; id++) {
    const parent = parents[id];
    if (parent < 0 || parent >= id) {
      hues[id] = (id * GOLDEN_ANGLE) % 360;
      continue;
    }
    const k = children.get(parent) ?? 0;
    children.set(parent, k + 1);
    const offset = (k % 2 === 0 ? 1 : -1) * (24 + 8 * Math.floor(k / 2));
    hues[id] = (((hues[parent] + offset) % 360) + 360) % 360;
  }
  return hues;
}

/** h in degrees, s and l in [0, 1] → RGB in [0, 1]. */
export function hslToRgb(h: number, s: number, l: number): Rgb {
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

export function sceneRgb(hues: Float32Array, id: number): Rgb {
  return id < 0 || id >= hues.length ? UNASSIGNED_RGB : hslToRgb(hues[id], 0.85, 0.6);
}
