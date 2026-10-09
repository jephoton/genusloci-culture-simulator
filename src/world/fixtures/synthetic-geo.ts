import { toLocalMetres } from "@/world/projection";
import type { Geo, World } from "@/world/schema";

const RIVER_HALF_WIDTH = 60;
const RIVER_POINTS = 25;

/** Smallest gap between distinct coordinates (rounded to 1 m), or `fallback` for a single row/column. */
function gridStep(values: number[], fallback: number): number {
  const sorted = [...new Set(values.map((v) => Math.round(v)))].sort((a, b) => a - b);
  let step = Infinity;
  for (let i = 1; i < sorted.length; i++) step = Math.min(step, sorted[i] - sorted[i - 1]);
  return Number.isFinite(step) ? step : fallback;
}

/**
 * Deterministic synthetic city geometry around a grid of cells (no randomness, so fixture RNG streams
 * are unaffected): major streets on cell boundaries, minor streets at thirds, a sinuous river, and a
 * park in every fifth cell. Coordinates are local metres relative to `origin`.
 */
export function syntheticGeo(cells: World["cells"], origin: { lat: number; lon: number }): Geo {
  const pts = cells.map((c) => toLocalMetres(c, origin));
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const dx = gridStep(xs, 600);
  const dy = gridStep(ys, 600);
  const bounds = {
    minX: Math.min(...xs) - dx / 2,
    maxX: Math.max(...xs) + dx / 2,
    minY: Math.min(...ys) - dy / 2,
    maxY: Math.max(...ys) + dy / 2,
  };
  const cols = Math.round((bounds.maxX - bounds.minX) / dx);
  const rows = Math.round((bounds.maxY - bounds.minY) / dy);

  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  // Street spacing derives from the bounds (not the 1 m-rounded cell step) so the last street stays inside them.
  const sx = width / cols;
  const sy = height / rows;

  const roads: Geo["roads"] = [];
  for (let k = 0; k <= cols; k++) {
    const x = bounds.minX + k * sx;
    roads.push({ kind: "major", points: [[x, bounds.minY], [x, bounds.maxY]] });
    if (k < cols) {
      for (const f of [1 / 3, 2 / 3]) {
        roads.push({ kind: "minor", points: [[x + f * sx, bounds.minY], [x + f * sx, bounds.maxY]] });
      }
    }
  }
  for (let k = 0; k <= rows; k++) {
    const y = bounds.minY + k * sy;
    roads.push({ kind: "major", points: [[bounds.minX, y], [bounds.maxX, y]] });
    if (k < rows) {
      for (const f of [1 / 3, 2 / 3]) {
        roads.push({ kind: "minor", points: [[bounds.minX, y + f * sy], [bounds.maxX, y + f * sy]] });
      }
    }
  }

  const midY = (bounds.minY + bounds.maxY) / 2;
  const centre = Array.from({ length: RIVER_POINTS }, (_, i): [number, number] => {
    const f = i / (RIVER_POINTS - 1);
    return [bounds.minX + f * width, midY + 0.22 * height * Math.sin(f * Math.PI * 2)];
  });
  const water: Geo["water"] = [
    [
      ...centre.map(([x, y]): [number, number] => [x, y + RIVER_HALF_WIDTH]),
      ...[...centre].reverse().map(([x, y]): [number, number] => [x, y - RIVER_HALF_WIDTH]),
    ],
  ];

  const parks: Geo["parks"] = pts.flatMap((p, i) =>
    i % 5 === 2
      ? [
          [
            [p.x + 0.05 * dx, p.y + 0.05 * dy],
            [p.x + 0.35 * dx, p.y + 0.05 * dy],
            [p.x + 0.35 * dx, p.y + 0.35 * dy],
            [p.x + 0.05 * dx, p.y + 0.35 * dy],
          ] as [number, number][],
        ]
      : [],
  );

  return { bounds, roads, water, parks };
}
