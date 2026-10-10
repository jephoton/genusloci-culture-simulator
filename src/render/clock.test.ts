import { describe, expect, it } from "vitest";
import { SimClock } from "@/render/clock";

describe("SimClock", () => {
  it("starts paused at zero and does not advance while paused", () => {
    const c = new SimClock();
    expect(c.now()).toBe(0);
    c.sync(5000);
    expect(c.now()).toBe(0);
    expect(c.playing).toBe(false);
  });

  it("accumulates real time only while playing", () => {
    const c = new SimClock();
    c.setPlaying(true, 1000);
    c.sync(1100);
    c.sync(1200);
    expect(c.now()).toBe(200);
    c.setPlaying(false, 1250);
    expect(c.now()).toBe(250);
    c.sync(9000);
    expect(c.now()).toBe(250);
  });

  it("resumes from exactly where it paused, skipping the paused gap", () => {
    const c = new SimClock();
    c.setPlaying(true, 0);
    c.sync(100);
    c.setPlaying(false, 150);
    c.setPlaying(true, 10_000);
    expect(c.now()).toBe(150);
    c.sync(10_050);
    expect(c.now()).toBe(200);
  });

  it("ignores repeated play or pause calls", () => {
    const c = new SimClock();
    c.setPlaying(true, 0);
    c.setPlaying(true, 100);
    c.sync(200);
    expect(c.now()).toBe(200);
    c.setPlaying(false, 300);
    c.setPlaying(false, 900);
    expect(c.now()).toBe(300);
  });

  it("caps a single step, so a stalled tab doesn't leap ahead", () => {
    const c = new SimClock(250);
    c.setPlaying(true, 0);
    c.sync(60_000);
    expect(c.now()).toBe(250);
  });

  it("never runs backwards", () => {
    const c = new SimClock();
    c.setPlaying(true, 1000);
    c.sync(900);
    expect(c.now()).toBe(0);
    c.sync(1000);
    expect(c.now()).toBe(0);
  });
});
