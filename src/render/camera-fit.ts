import * as THREE from "three";

/** A screen rectangle in normalised device coordinates (-1 to 1, y up). */
export type ScreenBox = { left: number; right: number; bottom: number; top: number };

/** Fraction of the free box the points may fill, leaving room for walkers around the venues. */
const FILL = 0.8;
const MIN_DISTANCE = 25;
const MAX_DISTANCE = 600;
const ROUNDS = 40;

/**
 * The look-at point (on the ground) and distance that frame `points` inside `box` on screen, keeping
 * the camera's viewing direction (`offset`, unit vector from the look point to the camera). It
 * projects the points with a copy of the camera and corrects the view until they fit.
 */
export function fitView(camera: THREE.PerspectiveCamera, offset: THREE.Vector3, points: THREE.Vector3[], box: ScreenBox): { x: number; z: number; distance: number } {
  const cam = camera.clone();
  let x = points.reduce((a, p) => a + p.x, 0) / points.length;
  let z = points.reduce((a, p) => a + p.z, 0) / points.length;
  // Start far enough back that every point is in front of the camera.
  let d = Math.max(MIN_DISTANCE, 3 * Math.max(...points.map((q) => Math.hypot(q.x - x, q.z - z) + q.y)));
  const flat = Math.hypot(offset.x, offset.z) || 1;
  // Ground directions for screen right and screen up (away from the camera).
  const right = new THREE.Vector3(offset.z / flat, 0, -offset.x / flat);
  const away = new THREE.Vector3(-offset.x / flat, 0, -offset.z / flat);
  const sinTilt = Math.max(0.2, offset.y);
  const tanHalf = Math.tan((cam.fov * Math.PI) / 360);
  const p = new THREE.Vector3();
  for (let round = 0; round < ROUNDS; round++) {
    cam.position.set(x + offset.x * d, offset.y * d, z + offset.z * d);
    cam.lookAt(x, 0, z);
    cam.updateMatrixWorld();
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    let behind = false;
    for (const q of points) {
      p.copy(q).project(cam);
      if (p.z > 1) behind = true;
      minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x);
      minY = Math.min(minY, p.y); maxY = Math.max(maxY, p.y);
    }
    if (behind) {
      d = Math.min(MAX_DISTANCE, d * 1.5);
      continue;
    }
    const halfH = d * tanHalf;
    // Shift so the points' centre sits at the box's centre (damped, since perspective skews it).
    const clamp = (v: number) => Math.max(-1, Math.min(1, v));
    const ex = clamp((minX + maxX) / 2 - (box.left + box.right) / 2);
    const ey = clamp((minY + maxY) / 2 - (box.bottom + box.top) / 2);
    x += 0.6 * (right.x * ex * halfH * cam.aspect + away.x * (ey * halfH) / sinTilt);
    z += 0.6 * (right.z * ex * halfH * cam.aspect + away.z * (ey * halfH) / sinTilt);
    // Scale the distance so the points fill FILL of the box.
    const fill = Math.max((maxX - minX) / (box.right - box.left), (maxY - minY) / (box.top - box.bottom), 1e-3) / FILL;
    d = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, d * Math.max(0.5, Math.min(2, fill)) ** 0.6));
  }
  return { x, z, distance: d };
}
