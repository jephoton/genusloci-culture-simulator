import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { hashState } from "@/sim/hash";
import { snapshotSpacing, Timeline } from "@/sim/timeline";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const world = makeTinyWorld();
const config = { ...DEFAULT_CONFIG, nAgents: 300, agentReserve: 50 };
const create = (snapshotEvery = 10) => Timeline.create(world, config, 4, snapshotEvery);

describe("Timeline", () => {
  it("advances and applies queued actions on the next tick", () => {
    const t = create();
    expect(t.queue({ type: "closeVenue", venue: 0 })).toBeNull();
    const results = t.advance(3);
    expect(results).toEqual([{ ok: true, venue: 0 }]);
    expect(t.state.tick).toBe(3);
    expect(t.state.log).toEqual([{ tick: 0, action: { type: "closeVenue", venue: 0 } }]);
  });

  it("refuses invalid actions up front", () => {
    const t = create();
    expect(t.queue({ type: "closeVenue", venue: 999 })).toMatch(/unknown venue/);
    expect(t.advance(1)).toEqual([]);
  });

  it("is deterministic across timelines with the same seed", () => {
    const a = create();
    const b = create();
    a.advance(20);
    b.advance(20);
    expect(hashState(a.state)).toBe(hashState(b.state));
  });

  it("rewinds exactly, replaying logged actions from the nearest snapshot", () => {
    const t = create(10);
    t.advance(5);
    t.queue({ type: "openVenue", entity: 30, cell: 2 });
    t.advance(7);
    const at12 = hashState(t.state);
    t.advance(6);
    t.rewind(12);
    expect(t.state.tick).toBe(12);
    expect(hashState(t.state)).toBe(at12);
  });

  it("discards later history after a rewind", () => {
    const t = create(10);
    t.advance(15);
    t.queue({ type: "closeVenue", venue: 1 });
    t.advance(5);
    t.rewind(12);
    expect(t.state.log).toEqual([]);
    expect(t.state.venueOpen[1]).toBe(1);
  });

  it("rejects rewinding into the future", () => {
    const t = create();
    t.advance(3);
    expect(() => t.rewind(4)).toThrow();
  });

  it("forks into an independent timeline", () => {
    const t = create();
    t.advance(5);
    const f = t.fork();
    f.queue({ type: "closeVenue", venue: 0 });
    f.advance(5);
    t.advance(5);
    expect(t.state.venueOpen[0]).toBe(1);
    expect(f.state.venueOpen[0]).toBe(0);
    expect(hashState(t.state)).not.toBe(hashState(f.state));
    f.rewind(2);
    expect(f.state.tick).toBe(2);
  });

  it("thins snapshots with age so old rewinds stay cheap and memory stays bounded", () => {
    const t = create(10);
    t.advance(1000);
    const ticks = t.snapshotTicks();
    expect(ticks[0]).toBe(0);
    expect(ticks.length).toBeLessThan(30);
    for (const k of ticks) {
      if (k === 0 || k === 1000) continue;
      expect(k % snapshotSpacing(1000 - k)).toBe(0);
    }
    for (let tick = 0; tick <= 1000; tick += 37) {
      const base = Math.max(...ticks.filter((k) => k <= tick));
      expect(tick - base).toBeLessThan(160);
    }
  });

  it("caps stored snapshots but can still rewind to the start", () => {
    const t = create(1);
    t.advance(50);
    t.rewind(0);
    expect(t.state.tick).toBe(0);
  });
});
