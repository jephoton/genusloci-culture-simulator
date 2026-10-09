import { describe, expect, it } from "vitest";
import { toLocalMetres } from "@/world/projection";

describe("toLocalMetres", () => {
  const origin = { lat: 51.5, lon: -0.1 };
  it("maps the origin to (0, 0)", () => {
    expect(toLocalMetres(origin, origin)).toEqual({ x: 0, y: 0 });
  });
  it("maps north to +y and east to +x in metres", () => {
    expect(toLocalMetres({ lat: 51.51, lon: -0.1 }, origin).y).toBeCloseTo(1105.4, 0);
    expect(toLocalMetres({ lat: 51.5, lon: -0.09 }, origin).x).toBeCloseTo(693, -1);
  });
});
