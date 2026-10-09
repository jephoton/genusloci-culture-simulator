import { describe, expect, it } from "vitest";
import { ShockwaveEffect } from "@/render/effects/ShockwaveEffect";

describe("ShockwaveEffect", () => {
  it("exposes MAX_WAVES wave slots and a shake uniform, all idle by default", () => {
    const e = new ShockwaveEffect();
    expect(e.setWaves([])).toBeUndefined();
    const waves = e.uniforms.get("uWaves")?.value as { w: number }[];
    expect(waves).toHaveLength(4);
    expect(waves.every((w) => w.w === 0)).toBe(true);
    e.setWaves([{ u: 0.5, v: 0.5, progress: 0.25, strength: 1 }]);
    expect(waves[0]).toMatchObject({ x: 0.5, y: 0.5, z: 0.25, w: 1 });
    e.setShake(0.01, -0.02);
    expect(e.uniforms.get("uShake")?.value).toMatchObject({ x: 0.01, y: -0.02 });
  });
});
