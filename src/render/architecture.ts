import * as THREE from "three";

/** Unit gable: eaves stay inside the footprint; the ridge runs along Z. */
export function gableGeometry(): THREE.BufferGeometry {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute([
    -0.5, 0, -0.5, 0.5, 0, -0.5, 0.5, 0, 0.5, -0.5, 0, 0.5, 0, 1, -0.5, 0, 1, 0.5,
  ], 3));
  g.setIndex([0, 5, 4, 0, 3, 5, 1, 5, 2, 1, 4, 5, 0, 4, 1, 3, 2, 5, 0, 2, 3, 0, 1, 2]);
  const faceted = g.toNonIndexed();
  g.dispose();
  faceted.computeVertexNormals();
  return faceted;
}

/** Short, chunky townhouses even on narrow lots; no placement or simulation changes. */
export function buildingProportions(width: number, depth: number, height: number): { wall: number; roof: number } {
  const side = Math.min(width, depth);
  return { wall: Math.min(7.5, Math.max(1.6, height * 0.55), 1.5 + side * 1.05), roof: Math.max(0.45, Math.min(1.8, side * 0.48)) };
}
