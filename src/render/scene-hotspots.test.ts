import { describe, expect, it } from "vitest";
import type { CityLayout } from "@/render/layout";
import { HOTSPOT_MIN_MEMBERS, HOTSPOT_MIN_RATIO, MAX_HOTSPOTS_PER_SCENE, sceneHotspots } from "@/render/scene-hotspots";

const layout = {
  cellX: Float32Array.from([0, 10, 20, 30]),
  cellZ: Float32Array.from([0, 5, 10, 15]),
} as unknown as CityLayout;
const world = { cells: [{}, {}, {}, {}] } as never;

/** A frame from per-cell lists of residents' scene ids (-1: no scene); every resident is alive. */
function frameOf(cells: number[][], dead: number[] = []) {
  const homeCell: number[] = [];
  const scene: number[] = [];
  cells.forEach((residents, c) => {
    for (const s of residents) {
      homeCell.push(c);
      scene.push(s);
    }
  });
  const alive = Uint8Array.from(homeCell, () => 1);
  for (const i of dead) alive[i] = 0;
  return { alive, homeCell: Int32Array.from(homeCell), scene: Int32Array.from(scene) };
}
const many = (s: number, n: number) => Array.from({ length: n }, () => s);

describe("sceneHotspots", () => {
  it("marks the cells where a scene is over-represented, at the cell centre", () => {
    // Scene 3 is a quarter of the city but 3/4 of cell 1; scene 8 is 3/4 of cell 2.
    const frame = frameOf([
      [...many(3, 5), ...many(8, 5), ...many(-1, 10)],
      [...many(3, 15), ...many(-1, 5)],
      [...many(8, 15), ...many(-1, 5)],
      [...many(-1, 20)],
    ]);
    const h = sceneHotspots(frame, layout, world);
    expect(h.map(({ scene, cell }) => [scene, cell])).toEqual([[3, 1], [8, 2]]);
    expect(h[0]).toMatchObject({ x: 10, z: 5 });
    expect(h[1]).toMatchObject({ x: 20, z: 10 });
    for (const s of h) {
      expect(s.strength).toBeGreaterThan(0);
      expect(s.strength).toBeLessThanOrEqual(1);
    }
  });

  it("ignores cells near the citywide share, and cells with too few members", () => {
    const few = HOTSPOT_MIN_MEMBERS - 1;
    const frame = frameOf([
      [...many(5, 10), ...many(-1, 10)], // half, as citywide: no hotspot
      [...many(5, 10), ...many(-1, 10)],
      [...many(5, few), ...many(-1, 0)], // all scene 5 but too few
      [...many(-1, 20)],
    ]);
    expect(sceneHotspots(frame, layout, world).map((s) => s.cell)).toEqual([]);
    expect(HOTSPOT_MIN_RATIO).toBeGreaterThan(1);
  });

  it("is stronger where the scene is more over-represented and has more members", () => {
    const frame = frameOf([
      [...many(1, 45), ...many(-1, 5)], // 90% of a big cell (ratio ≈ 2.95)
      [...many(1, 13), ...many(-1, 7)], // 65% of a smaller cell (ratio ≈ 2.13)
      [...many(-1, 60)],
      [...many(-1, 60)],
    ]);
    const [a, b] = sceneHotspots(frame, layout, world);
    expect([a.cell, b.cell]).toEqual([0, 1]);
    expect(a.strength).toBeGreaterThan(b.strength);
    expect(a.strength).toBeGreaterThan(0.9);
  });

  it("keeps only a scene's strongest hotspots", () => {
    const nCells = MAX_HOTSPOTS_PER_SCENE + 11;
    const wide = { cellX: new Float32Array(nCells), cellZ: new Float32Array(nCells) } as unknown as CityLayout;
    // Scene 0 clusters in the first MAX + 1 cells, more strongly the earlier the cell; the rest are empty of it.
    const cells = Array.from({ length: nCells }, (_, c) =>
      c <= MAX_HOTSPOTS_PER_SCENE ? [...many(0, 30 - c), ...many(-1, 10 + c)] : many(-1, 40),
    );
    const h = sceneHotspots(frameOf(cells), wide, { cells: cells.map(() => ({})) } as never);
    expect(h.map((s) => s.cell)).toEqual(Array.from({ length: MAX_HOTSPOTS_PER_SCENE }, (_, c) => c));
  });

  it("counts only living residents", () => {
    const cells = [[...many(2, 10), ...many(-1, 10)], many(-1, 20), many(-1, 20), many(-1, 20)];
    expect(sceneHotspots(frameOf(cells), layout, world).map((s) => s.cell)).toEqual([0]);
    // Kill all of scene 2: no hotspot.
    expect(sceneHotspots(frameOf(cells, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]), layout, world)).toEqual([]);
  });

  it("is empty when nobody belongs to a scene", () => {
    expect(sceneHotspots(frameOf([many(-1, 5), [], [], []]), layout, world)).toEqual([]);
  });
});
