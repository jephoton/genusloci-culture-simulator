import * as THREE from "three";
import { describe, expect, it } from "vitest";
import { fitView } from "@/render/camera-fit";

/** The city camera's default angle: up 0.16, back 0.2 (see CityCanvas). */
const offset = new THREE.Vector3(0, 0.16, 0.2).normalize();

function project(camera: THREE.PerspectiveCamera, view: { x: number; z: number; distance: number }, points: THREE.Vector3[]) {
  const cam = camera.clone();
  cam.position.set(view.x + offset.x * view.distance, offset.y * view.distance, view.z + offset.z * view.distance);
  cam.lookAt(view.x, 0, view.z);
  cam.updateMatrixWorld();
  return points.map((p) => p.clone().project(cam));
}

describe("fitView", () => {
  const camera = new THREE.PerspectiveCamera(42, 1600 / 900, 0.5, 5000);
  const box = { left: -0.45, right: 1, bottom: -1, top: 1 };

  it("frames spread-out venues inside the free part of the screen, filling most of it", () => {
    const points = [new THREE.Vector3(0, 0, 0), new THREE.Vector3(150, 0, -40), new THREE.Vector3(60, 16, 120)];
    const view = fitView(camera, offset, points, box);
    const ndc = project(camera, view, points);
    for (const p of ndc) {
      expect(p.x).toBeGreaterThan(box.left);
      expect(p.x).toBeLessThan(box.right);
      expect(p.y).toBeGreaterThan(box.bottom);
      expect(p.y).toBeLessThan(box.top);
    }
    const width = Math.max(...ndc.map((p) => p.x)) - Math.min(...ndc.map((p) => p.x));
    const height = Math.max(...ndc.map((p) => p.y)) - Math.min(...ndc.map((p) => p.y));
    expect(Math.max(width / 1.45, height / 2)).toBeGreaterThan(0.7);
  });

  it("comes closer for venues that are close together", () => {
    const near = fitView(camera, offset, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(20, 0, 0)], box);
    const far = fitView(camera, offset, [new THREE.Vector3(0, 0, 0), new THREE.Vector3(300, 0, 0)], box);
    expect(near.distance).toBeLessThan(far.distance);
  });
});
