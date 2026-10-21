import { expect, it } from "vitest";
import { buildingProportions, gableGeometry } from "@/render/architecture";

it("keeps roof geometry in its footprint with a ground-level eave and finite faceted normals", () => {
  const roof = gableGeometry();
  roof.computeBoundingBox();
  expect(roof.boundingBox!.min.toArray()).toEqual([-0.5, 0, -0.5]);
  expect(roof.boundingBox!.max.toArray()).toEqual([0.5, 1, 0.5]);
  const normal = roof.getAttribute("normal");
  for (const v of normal.array) expect(Number.isFinite(v)).toBe(true);
  const position = roof.getAttribute("position");
  // Both sloping roof faces must face upward, so back-face culling cannot hide them from above.
  expect(normal.getY(0)).toBeGreaterThan(0);
  expect(normal.getY(6)).toBeGreaterThan(0);
  expect(position.count).toBe(24);
  roof.dispose();
});

it("keeps narrow lots low and produces repeatable roof/body proportions", () => {
  const narrow = buildingProportions(1.2, 2, 19);
  expect(narrow.wall).toBeLessThan(3);
  expect(narrow.roof).toBeGreaterThan(0);
  expect(narrow.wall + narrow.roof).toBeLessThan(5);
  expect(buildingProportions(5, 6, 15)).toEqual(buildingProportions(5, 6, 15));
  expect(buildingProportions(5, 6, 15).wall).toBeLessThan(9);
});
