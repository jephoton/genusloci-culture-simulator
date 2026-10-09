import { describe, expect, it } from "vitest";
import { chooseVenueEntity } from "@/render/placement";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const clusterOf = (e: number) => Math.floor(e / 12);

describe("chooseVenueEntity", () => {
  it("picks a place of the requested kind that suits the cell's dominant scene", () => {
    for (let cell = 0; cell < world.cells.length; cell++) {
      const kinds = new Set(world.entities.filter((e) => e.type === "place").map((e) => e.kind));
      for (const kind of kinds) {
        const e = chooseVenueEntity(world, kind ?? "other", cell);
        expect(world.entities[e].type).toBe("place");
        expect(world.entities[e].kind).toBe(kind);
      }
    }
    const cell = world.cells.findIndex((c) => c.archetypes[0].weight > 0.5);
    const dominant = world.cells[cell].archetypes[0].archetype;
    const anyKind = world.entities.find((e) => e.type === "place" && clusterOf(world.entities.indexOf(e)) === dominant)?.kind ?? "other";
    expect(clusterOf(chooseVenueEntity(world, anyKind, cell))).toBe(dominant);
  });

  it("falls back to any place when no place has that kind", () => {
    const e = chooseVenueEntity(world, "stadium", 0);
    expect(world.entities[e].type).toBe("place");
  });
});
