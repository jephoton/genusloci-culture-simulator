import type { FrameChange } from "@/render/effects/diff";
import type { XZ } from "@/render/layout";
import type { Rgb } from "@/render/palette";

export const MAX_WAVES = 4;

/** Screen-space shockwave anchored at a world point. strength > 0 bulges out, < 0 implodes. */
export type Wave = { x: number; z: number; start: number; duration: number; strength: number };
/** Expanding coloured ring on the ground. */
export type Ripple = { x: number; z: number; start: number; duration: number; radius: number; rgb: Rgb };

export type Anchors = {
  venue(slot: number): XZ | null;
  scene(id: number): XZ | null;
  sceneRgb(id: number): Rgb;
  venueRgb(slot: number): Rgb;
};

const GREY: Rgb = [0.6, 0.62, 0.7];

/**
 * Turns frame changes into timed effects. Pure apart from its own state: time is passed in, so it
 * is testable and deterministic. Renderers read `waves`, `ripples` and `shake(now)` every frame.
 */
export class EffectsDirector {
  waves: Wave[] = [];
  ripples: Ripple[] = [];
  private shakeStart = -Infinity;
  private shakeDuration = 0;
  private shakeAmp = 0;

  ingest(changes: FrameChange[], now: number, anchors: Anchors): void {
    for (const c of changes) {
      if (c.kind === "venueOpened" || c.kind === "venueClosed" || c.kind === "eventStarted" || c.kind === "eventEnded") {
        const p = anchors.venue(c.slot);
        if (!p) continue;
        const opening = c.kind === "venueOpened" || c.kind === "eventStarted";
        if (c.kind !== "eventEnded") {
          this.addWave({ x: p[0], z: p[1], start: now, duration: opening ? 1200 : 900, strength: opening ? 1 : -0.7 });
          this.kick(now, opening ? 0.006 : 0.004, opening ? 380 : 280);
        }
        this.ripples.push({
          x: p[0], z: p[1], start: now,
          duration: opening ? 1400 : 900,
          radius: c.kind === "eventStarted" ? 60 : opening ? 30 : 18,
          rgb: opening ? anchors.venueRgb(c.slot) : GREY,
        });
      } else {
        const p = anchors.scene(c.scene);
        if (!p) continue;
        const born = c.kind === "sceneBorn";
        this.ripples.push({
          x: p[0], z: p[1], start: now,
          duration: born ? 1800 : 1200,
          radius: born ? 45 : 25,
          rgb: born ? anchors.sceneRgb(c.scene) : GREY,
        });
      }
    }
  }

  /** Wave/ripple progress in [0, 1]. */
  progress(effect: { start: number; duration: number }, now: number): number {
    return Math.max(0, Math.min(1, (now - effect.start) / effect.duration));
  }

  /** Screen-UV shake offset at `now`, decaying to [0, 0]. */
  shake(now: number): [number, number] {
    const t = (now - this.shakeStart) / this.shakeDuration;
    if (!(t >= 0 && t < 1)) return [0, 0];
    const amp = this.shakeAmp * (1 - t) * (1 - t);
    return [amp * Math.sin(now * 0.09), amp * Math.cos(now * 0.071)];
  }

  prune(now: number): void {
    this.waves = this.waves.filter((w) => now - w.start < w.duration);
    this.ripples = this.ripples.filter((r) => now - r.start < r.duration);
  }

  private addWave(w: Wave): void {
    this.waves.unshift(w);
    if (this.waves.length > MAX_WAVES) this.waves.length = MAX_WAVES;
  }

  private kick(now: number, amp: number, duration: number): void {
    const remaining = this.shake(now);
    if (Math.hypot(remaining[0], remaining[1]) > amp) return;
    this.shakeStart = now;
    this.shakeDuration = duration;
    this.shakeAmp = amp;
  }
}
