import { describe, expect, it } from "vitest";
import { equilibrateCapacities } from "@/world/builder/equilibrate";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { parseWorld } from "@/world/schema";

describe("equilibrateCapacities", () => {
  const world = makeTinyWorld({ seed: 2 });
  // A venue far too big for its crowd, to check it is pulled towards what it actually draws.
  const big = world.entities.findIndex((e) => e.type === "place" && e.cell !== undefined);
  const skewed = { ...world, entities: world.entities.map((e, i) => (i === big ? { ...e, capacity: 10_000 } : e)) };
  const config = { nAgents: 300 };

  it("moves capacities towards measured visits and stays schema-valid and deterministic", () => {
    const out = equilibrateCapacities(skewed, config, 5);
    expect(() => parseWorld(out)).not.toThrow();
    expect(out.entities[big].capacity).toBeLessThan(10_000 * 0.6);
    expect(out.entities[big].capacity).toBeGreaterThan(10_000 * 0.4);
    expect(equilibrateCapacities(skewed, config, 5)).toEqual(out);
  });

  it("only changes venue capacities, scaling reserve places with the placed ones", () => {
    // Make one venue a reserve place (no cell) with a known capacity.
    const reserve = skewed.entities.findIndex((e, i) => e.type === "place" && i !== big);
    const w = { ...skewed, entities: skewed.entities.map((e, i) => (i === reserve ? { ...e, cell: undefined, capacity: 50 } : e)) };
    const out = equilibrateCapacities(w, config, 5);
    out.entities.forEach((e, i) => {
      if (e.type !== "place") expect(e).toEqual(w.entities[i]);
      else expect({ ...e, capacity: 0 }).toEqual({ ...w.entities[i], capacity: 0 });
    });
    expect(out.entities[reserve].capacity).not.toBe(50);
    expect(out.entities[reserve].cell).toBeUndefined();
  });
});
