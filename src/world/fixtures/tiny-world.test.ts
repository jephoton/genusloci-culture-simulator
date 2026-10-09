import { describe, expect, it } from "vitest";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { parseWorld } from "@/world/schema";

describe("makeTinyWorld", () => {
  it("produces a schema-valid world", () => {
    expect(() => parseWorld(makeTinyWorld())).not.toThrow();
  });

  it("is deterministic per seed", () => {
    expect(makeTinyWorld({ seed: 3 })).toEqual(makeTinyWorld({ seed: 3 }));
    expect(makeTinyWorld({ seed: 3 })).not.toEqual(makeTinyWorld({ seed: 4 }));
  });

  it("has the requested shape", () => {
    const w = makeTinyWorld({ clusters: 3, entitiesPerCluster: 12, gridSize: 4 });
    expect(w.entities).toHaveLength(36);
    expect(w.cells).toHaveLength(16);
    expect(w.archetypes).toHaveLength(3);
    expect(w.entities.filter((e) => e.type === "place")).toHaveLength(12);
  });

  it("links entities within a cluster more strongly than across clusters", () => {
    const w = makeTinyWorld();
    const per = 12;
    const cluster = (i: number) => Math.floor(i / per);
    const intra = w.edges.filter((e) => cluster(e.source) === cluster(e.target));
    const cross = w.edges.filter((e) => cluster(e.source) !== cluster(e.target));
    const min = Math.min(...intra.map((e) => e.weight));
    const max = Math.max(...cross.map((e) => e.weight));
    expect(min).toBeGreaterThan(max);
  });

  it("uses only synthetic ids", () => {
    expect(makeTinyWorld().entities.every((e) => e.id.startsWith("syn:"))).toBe(true);
  });
});
