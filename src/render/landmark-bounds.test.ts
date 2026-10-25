import { Children, isValidElement, type ReactNode } from "react";
import * as THREE from "three";
import { expect, it, vi } from "vitest";

// Resolve the procedural React model tree without mounting a WebGL renderer.
vi.mock("react", async () => ({
  ...await vi.importActual<typeof import("react")>("react"),
  useMemo: (make: () => unknown) => make(), useEffect: () => {},
}));
import { Body, type Materials } from "@/render/Landmarks";
import { LANDMARK_RADIUS } from "@/render/layout";
import type { VenueKind } from "@/world/schema";

it("keeps every styled venue and its roof inside its declared pad radius", () => {
  const mats: Materials = { body: new THREE.MeshStandardMaterial(), neon: new THREE.MeshBasicMaterial(), band: new THREE.MeshBasicMaterial() };
  const constructors: Record<string, (...args: number[]) => THREE.BufferGeometry> = {
    boxGeometry: (...a) => new THREE.BoxGeometry(...a), cylinderGeometry: (...a) => new THREE.CylinderGeometry(...a),
    coneGeometry: (...a) => new THREE.ConeGeometry(...a), torusGeometry: (...a) => new THREE.TorusGeometry(...a),
    sphereGeometry: (...a) => new THREE.SphereGeometry(...a), circleGeometry: (...a) => new THREE.CircleGeometry(...a),
  };
  for (const kind of Object.keys(LANDMARK_RADIUS) as VenueKind[]) {
    let radius = 0;
    const walk = (node: ReactNode, parent: THREE.Matrix4) => {
      if (!isValidElement<Record<string, unknown>>(node)) return;
      const p = node.props;
      if (typeof node.type === "function") {
        walk((node.type as (props: Record<string, unknown>) => ReactNode)(p), parent);
        return;
      }
      const object = new THREE.Object3D();
      if (Array.isArray(p.position)) object.position.fromArray(p.position as number[]);
      if (typeof p["position-y"] === "number") object.position.y = p["position-y"];
      for (const axis of ["x", "y", "z"] as const) if (typeof p[`rotation-${axis}`] === "number") object.rotation[axis] = p[`rotation-${axis}`] as number;
      if (typeof p.scale === "number") object.scale.setScalar(p.scale);
      else if (Array.isArray(p.scale)) object.scale.fromArray(p.scale as number[]);
      object.updateMatrix();
      const matrix = parent.clone().multiply(object.matrix);
      const measure = (geometry: THREE.BufferGeometry) => {
        const position = geometry.getAttribute("position");
        const v = new THREE.Vector3();
        for (let i = 0; i < position.count; i++) {
          v.fromBufferAttribute(position, i).applyMatrix4(matrix);
          radius = Math.max(radius, Math.hypot(v.x, v.z));
        }
      };
      if (p.geometry instanceof THREE.BufferGeometry) { measure(p.geometry); p.geometry.dispose(); }
      Children.forEach(p.children as ReactNode, (child) => {
        if (isValidElement<{ args?: number[] }>(child) && typeof child.type === "string" && constructors[child.type]) {
          const geometry = constructors[child.type](...(child.props.args ?? []));
          measure(geometry); geometry.dispose();
        } else walk(child, matrix);
      });
    };
    walk(Body({ kind, mats }), new THREE.Matrix4());
    expect(radius, kind).toBeLessThanOrEqual(LANDMARK_RADIUS[kind] + 0.001);
  }
  Object.values(mats).forEach((m) => m.dispose());
});
