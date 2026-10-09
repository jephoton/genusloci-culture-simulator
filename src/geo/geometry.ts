export type Pt = [number, number];
export type Rect = { minX: number; minY: number; maxX: number; maxY: number };

/** Even-odd ray casting. */
export function pointInPolygon(x: number, y: number, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function segmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker simplification (iterative); always keeps the endpoints. */
export function simplify(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points.slice();
  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: [number, number][] = [[0, points.length - 1]];
  while (stack.length > 0) {
    const [s, e] = stack.pop() as [number, number];
    let worst = -1;
    let worstD = tolerance;
    for (let i = s + 1; i < e; i++) {
      const d = segmentDistance(points[i], points[s], points[e]);
      if (d > worstD) {
        worstD = d;
        worst = i;
      }
    }
    if (worst >= 0) {
      keep[worst] = 1;
      stack.push([s, worst], [worst, e]);
    }
  }
  return points.filter((_, i) => keep[i] === 1);
}

/** Liang–Barsky: the part of segment a→b inside rect, or null. */
function clipSegment(a: Pt, b: Pt, r: Rect): [Pt, Pt] | null {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, a[0] - r.minX],
    [dx, r.maxX - a[0]],
    [-dy, a[1] - r.minY],
    [dy, r.maxY - a[1]],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q < 0) return null;
      continue;
    }
    const t = q / p;
    if (p < 0) t0 = Math.max(t0, t);
    else t1 = Math.min(t1, t);
    if (t0 > t1) return null;
  }
  return [
    [a[0] + t0 * dx, a[1] + t0 * dy],
    [a[0] + t1 * dx, a[1] + t1 * dy],
  ];
}

const same = (p: Pt, q: Pt) => p[0] === q[0] && p[1] === q[1];

/** Clips a polyline to rect, returning the inside pieces (a line that leaves and re-enters becomes several). */
export function clipPolyline(points: Pt[], rect: Rect): Pt[][] {
  const out: Pt[][] = [];
  let current: Pt[] | null = null;
  for (let i = 0; i + 1 < points.length; i++) {
    const seg = clipSegment(points[i], points[i + 1], rect);
    if (!seg) {
      current = null;
      continue;
    }
    if (current && same(current[current.length - 1], seg[0])) current.push(seg[1]);
    else {
      current = [seg[0], seg[1]];
      out.push(current);
    }
    if (!same(seg[1], points[i + 1])) current = null;
  }
  return out.filter((line) => line.length >= 2 && !(line.length === 2 && same(line[0], line[1])));
}

/** Sutherland–Hodgman clip of a ring to rect; null if fewer than 3 points remain. */
export function clipPolygon(ring: Pt[], rect: Rect): Pt[] | null {
  type Edge = { inside: (p: Pt) => boolean; cross: (a: Pt, b: Pt) => Pt };
  const lerpX = (a: Pt, b: Pt, x: number): Pt => [x, a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0])];
  const lerpY = (a: Pt, b: Pt, y: number): Pt => [a[0] + ((b[0] - a[0]) * (y - a[1])) / (b[1] - a[1]), y];
  const edges: Edge[] = [
    { inside: (p) => p[0] >= rect.minX, cross: (a, b) => lerpX(a, b, rect.minX) },
    { inside: (p) => p[0] <= rect.maxX, cross: (a, b) => lerpX(a, b, rect.maxX) },
    { inside: (p) => p[1] >= rect.minY, cross: (a, b) => lerpY(a, b, rect.minY) },
    { inside: (p) => p[1] <= rect.maxY, cross: (a, b) => lerpY(a, b, rect.maxY) },
  ];
  let poly = ring.length > 1 && same(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring.slice();
  for (const edge of edges) {
    const next: Pt[] = [];
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i];
      const prev = poly[(i + poly.length - 1) % poly.length];
      if (edge.inside(cur)) {
        if (!edge.inside(prev)) next.push(edge.cross(prev, cur));
        next.push(cur);
      } else if (edge.inside(prev)) {
        next.push(edge.cross(prev, cur));
      }
    }
    poly = next;
    if (poly.length === 0) break;
  }
  return poly.length >= 3 ? poly : null;
}

const key = (p: Pt) => `${p[0].toFixed(2)},${p[1].toFixed(2)}`;

/** Joins open ways that share endpoints into closed rings (multipolygon members); unclosed chains are dropped. */
export function assembleRings(ways: Pt[][]): Pt[][] {
  const rings: Pt[][] = [];
  const pool = ways.filter((w) => w.length >= 2).map((w) => w.slice());
  while (pool.length > 0) {
    let ring = pool.shift() as Pt[];
    let grew = true;
    while (key(ring[0]) !== key(ring[ring.length - 1]) && grew) {
      grew = false;
      const end = key(ring[ring.length - 1]);
      for (let i = 0; i < pool.length; i++) {
        const w = pool[i];
        if (key(w[0]) === end) ring = ring.concat(w.slice(1));
        else if (key(w[w.length - 1]) === end) ring = ring.concat(w.slice(0, -1).reverse());
        else continue;
        pool.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && key(ring[0]) === key(ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}
