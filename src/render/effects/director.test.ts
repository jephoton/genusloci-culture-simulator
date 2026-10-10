import { describe, expect, it } from "vitest";
import { EffectsDirector, MAX_AUTO_WAVES, MAX_WAVES } from "@/render/effects/director";

const at = (x: number, z: number) => () => [x, z] as [number, number];
const anchors = {
  venue: (slot: number) => (slot >= 0 ? ([slot * 10, 0] as [number, number]) : null),
  scene: at(5, 5),
  sceneRgb: () => [1, 0, 0] as [number, number, number],
  venueRgb: () => [0, 1, 0] as [number, number, number],
};

describe("EffectsDirector", () => {
  it("turns a venue opening into an outward wave, a ripple and a shake", () => {
    const d = new EffectsDirector();
    d.ingest([{ kind: "venueOpened", slot: 2 }], 1000, anchors);
    expect(d.waves).toHaveLength(1);
    expect(d.waves[0]).toMatchObject({ x: 20, z: 0, start: 1000 });
    expect(d.waves[0].strength).toBeGreaterThan(0);
    expect(d.ripples).toHaveLength(1);
    const [sx, sy] = d.shake(1050);
    expect(Math.abs(sx) + Math.abs(sy)).toBeGreaterThan(0);
  });

  it("implodes on closure (negative strength) and ripples for scene births", () => {
    const d = new EffectsDirector();
    d.ingest([{ kind: "venueClosed", slot: 1 }, { kind: "sceneBorn", scene: 3, parent: null }], 0, anchors);
    expect(d.waves[0].strength).toBeLessThan(0);
    expect(d.ripples.some((r) => r.x === 5 && r.z === 5 && r.rgb[0] === 1)).toBe(true);
  });

  it("keeps at most MAX_WAVES waves, newest first, and expires old effects", () => {
    const d = new EffectsDirector();
    for (let i = 0; i < MAX_WAVES + 3; i++) d.ingest([{ kind: "venueOpened", slot: i }], i, anchors);
    expect(d.waves).toHaveLength(MAX_WAVES);
    expect(d.waves[0].x).toBe((MAX_WAVES + 2) * 10);
    d.prune(100_000);
    expect(d.waves).toHaveLength(0);
    expect(d.ripples).toHaveLength(0);
    expect(d.shake(100_000)).toEqual([0, 0]);
  });

  it("reports wave progress in [0, 1] and skips changes without an anchor", () => {
    const d = new EffectsDirector();
    d.ingest([{ kind: "venueOpened", slot: -1 }], 0, anchors);
    expect(d.waves).toHaveLength(0);
    d.ingest([{ kind: "venueOpened", slot: 1 }], 0, anchors);
    expect(d.progress(d.waves[0], 0)).toBe(0);
    expect(d.progress(d.waves[0], 1e9)).toBe(1);
  });

  it("softens automatic openings: a small wave, a smaller ripple and no shake", () => {
    const player = new EffectsDirector();
    player.ingest([{ kind: "venueOpened", slot: 1 }], 0, anchors, () => "player");
    const auto = new EffectsDirector();
    auto.ingest([{ kind: "venueOpened", slot: 1 }], 0, anchors, () => "auto");
    expect(auto.waves).toHaveLength(1);
    expect(auto.waves[0].strength).toBeGreaterThan(0);
    expect(auto.waves[0].strength).toBeLessThanOrEqual(player.waves[0].strength * 0.4);
    expect(auto.ripples[0].radius).toBeLessThan(player.ripples[0].radius);
    expect(auto.ripples[0].rgb).toEqual([0, 1, 0]);
    expect(auto.shake(50)).toEqual([0, 0]);
    expect(player.shake(50)).not.toEqual([0, 0]);
  });

  it("caps automatic waves at MAX_AUTO_WAVES per ingest, but still ripples for each", () => {
    const d = new EffectsDirector();
    const burst = [1, 2, 3, 4, 5].map((slot) => ({ kind: "venueOpened" as const, slot }));
    d.ingest(burst, 0, anchors, () => "auto");
    expect(d.waves).toHaveLength(MAX_AUTO_WAVES);
    expect(d.ripples).toHaveLength(5);
    // The cap is per frame: the next frame's openings get waves again, and player waves are never capped.
    d.ingest([{ kind: "venueOpened", slot: 6 }], 10, anchors, () => "auto");
    expect(d.waves).toHaveLength(MAX_AUTO_WAVES + 1);
    const p = new EffectsDirector();
    p.ingest(burst.slice(0, 3), 0, anchors, () => "player");
    expect(p.waves).toHaveLength(3);
  });

  it("implodes on automatic closures without shaking; player closures still shake", () => {
    const auto = new EffectsDirector();
    auto.ingest([{ kind: "venueClosed", slot: 1 }], 0, anchors, () => "auto");
    expect(auto.waves[0].strength).toBeLessThan(0);
    expect(auto.shake(50)).toEqual([0, 0]);
    const player = new EffectsDirector();
    player.ingest([{ kind: "venueClosed", slot: 1 }], 0, anchors, () => "player");
    expect(player.shake(50)).not.toEqual([0, 0]);
  });

  it("marks a struggling venue with a small red ripple and nothing on screen", () => {
    const d = new EffectsDirector();
    d.ingest([{ kind: "venueStruggling", slot: 2 }], 0, anchors, () => "auto");
    expect(d.waves).toHaveLength(0);
    expect(d.ripples).toHaveLength(1);
    expect(d.ripples[0]).toMatchObject({ x: 20, z: 0 });
    const [r, g, b] = d.ripples[0].rgb;
    expect(r).toBeGreaterThan(g + b);
    expect(d.shake(50)).toEqual([0, 0]);
  });
});
