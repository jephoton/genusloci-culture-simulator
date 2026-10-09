import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { XZ } from "@/render/layout";

/** Flat ribbons (y = 0) along polylines, `halfWidth` either side: 4 vertices and 2 triangles per segment. */
export function ribbonGeometry(lines: XZ[][], halfWidth: number): THREE.BufferGeometry {
  const positions: number[] = [];
  const indices: number[] = [];
  for (const line of lines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const [ax, az] = line[i];
      const [bx, bz] = line[i + 1];
      const len = Math.hypot(bx - ax, bz - az);
      if (len === 0) continue;
      const nx = (-(bz - az) / len) * halfWidth;
      const nz = ((bx - ax) / len) * halfWidth;
      const base = positions.length / 3;
      positions.push(ax + nx, 0, az + nz, ax - nx, 0, az - nz, bx + nx, 0, bz + nz, bx - nx, 0, bz - nz);
      indices.push(base, base + 2, base + 1, base + 1, base + 2, base + 3);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  g.setIndex(indices);
  g.computeVertexNormals();
  return g;
}

/** Flat polygons (y = 0) from scene-space rings; null when there are none. */
export function polygonGeometry(polys: XZ[][]): THREE.BufferGeometry | null {
  if (polys.length === 0) return null;
  const parts = polys.map((ring) => {
    const g = new THREE.ShapeGeometry(new THREE.Shape(ring.map(([x, z]) => new THREE.Vector2(x, -z))));
    g.rotateX(-Math.PI / 2);
    return g;
  });
  const merged = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  return merged;
}
