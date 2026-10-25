import { describe, expect, it } from "vitest";
import { GeoSchema } from "@/world/schema";
import { makeStreetLabelCandidates, selectStreetLabels, snapStreetLabels } from "@/render/street-labels";

describe("street labels", () => {
  it("preserves optional names through the world geometry schema", () => {
    const geo = GeoSchema.parse({ bounds: { minX: 0, maxX: 100, minY: 0, maxY: 100 }, roads: [{ name: "Broadway", kind: "major", points: [[0, 0], [100, 0]] }], water: [], parks: [] });
    expect(geo.roads[0].name).toBe("Broadway");
  });

  it("ignores unnamed and short streets, keeping real names and their street tangent", () => {
    const labels = makeStreetLabelCandidates([
      { kind: "major", name: "Broadway", points: [[0, 0], [20, 10]] },
      { kind: "minor", points: [[0, 0], [30, 0]] },
      { kind: "minor", name: "Tiny", points: [[0, 0], [1, 0]] },
    ]);
    expect(labels).toHaveLength(1);
    expect(labels[0]).toMatchObject({ name: "Broadway", x: 10, z: 5, dx: 20, dz: 10 });
  });

  it("keeps names readable, within the viewport and apart, with one label per street", () => {
    const labels = selectStreetLabels([
      { name: "Broadway", x: 100, y: 100, dx: -150, dy: 0, major: true },
      { name: "Broadway", x: 300, y: 100, dx: 150, dy: 0, major: true },
      { name: "Crowded", x: 110, y: 100, dx: 150, dy: 0, major: false },
      { name: "Offscreen", x: -40, y: 40, dx: 150, dy: 0, major: true },
      { name: "Canal Street", x: 260, y: 240, dx: 150, dy: 0, major: true },
    ], 400, 300);
    expect(labels.map((l) => l.name)).toEqual(["Broadway", "Canal Street"]);
    expect(labels[0].angle).toBeCloseTo(0);
  });

  it("hides segments too short on screen to hold their name", () => {
    expect(selectStreetLabels([{ name: "Long Street Name", x: 100, y: 100, dx: 15, dy: 0, major: true }], 400, 300)).toHaveLength(0);
  });

  it("anchors supplemental names to the existing street geometry and drops mismatches", () => {
    const result = snapStreetLabels([
      { name: "Broadway", x: 10, z: 0.7, dx: 20, dz: 0, major: true },
      { name: "Wrong place", x: 10, z: 20, dx: 20, dz: 0, major: true },
      { name: "Cross street", x: 10, z: 0, dx: 0, dz: 20, major: true },
    ], [{ kind: "major", points: [[0, 0], [20, 0]] }]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ name: "Broadway", x: 10, z: 0 });
  });
});
