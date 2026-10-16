import { afterEach, describe, expect, it, vi } from "vitest";
import type { Frame } from "@/sim/frame";
import type { FrameStore } from "@/render/frame-store";
import type { SimDigest } from "@/sim/digest";
// Minimal effect runner: exercise the hook's actual dependency and cleanup behavior without a DOM.
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], pending: [] as (() => void)[], reset() { this.cursor = 0; this.slots = []; this.pending = []; } }));
vi.mock("react", () => ({
  useState(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = typeof initial === "function" ? initial() : initial;
    return [hooks.slots[index], (next: unknown) => { hooks.slots[index] = typeof next === "function" ? next(hooks.slots[index]) : next; }];
  },
  useRef(initial: unknown) {
    const index = hooks.cursor++;
    if (!(index in hooks.slots)) hooks.slots[index] = { current: initial };
    return hooks.slots[index];
  },
  useEffect(effect: () => void | (() => void), deps?: unknown[]) {
    const index = hooks.cursor++;
    const previous = hooks.slots[index] as { deps?: unknown[]; cleanup?: () => void } | undefined;
    if (!deps || !previous || deps.some((value, i) => !Object.is(value, previous.deps?.[i]))) {
      hooks.pending.push(() => { previous?.cleanup?.(); hooks.slots[index] = { deps, cleanup: effect() }; });
    }
  },
}));
import { useSceneNames } from "@/ui/useSceneNames";
function setup() {
  hooks.reset(); vi.useFakeTimers();
  let frame = { epoch: 1, tick: 4, lineageParents: new Int32Array([-1, 0]) } as Frame;
  const frames = { current: { current: frame } as FrameStore };
  let digest = { tick: 4, scenes: [{ id: 1 }] } as SimDigest;
  const RenderNaming = () => {
    frames.current.current = frame; hooks.cursor = 0;
    const result = useSceneNames("City", digest, (id) => ({ id, tastes: ["music"], homes: [] }), frame, frames);
    for (const effect of hooks.pending.splice(0)) effect();
    return result;
  };
  return { render: RenderNaming, advance(tick: number) { frame = { ...frame, tick }; }, rewind() { frame = { ...frame, epoch: 2, tick: 2, lineageParents: new Int32Array([-1]) }; digest = { tick: 2, scenes: [] } as unknown as SimDigest; } };
}
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
describe("scene naming hook timeline effects", () => {
  it("does not restart the naming debounce on ordinary streamed frames", async () => {
    const fetcher = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ names: [{ id: 1, name: "New scene" }] }) });
    vi.stubGlobal("fetch", fetcher);
    const sim = setup(); sim.render();
    await vi.advanceTimersByTimeAsync(1000);
    sim.advance(5); sim.render();
    await vi.advanceTimersByTimeAsync(500);
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(sim.render().get(1)?.name).toBe("New scene");
  });
  it("drops a response whose JSON resolves after a rewind", async () => {
    let resolve!: (data: unknown) => void;
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: () => new Promise((done) => { resolve = done; }) }));
    const sim = setup(); sim.render();
    await vi.advanceTimersByTimeAsync(1500);
    sim.rewind(); sim.render();
    resolve({ names: [{ id: 1, name: "Discarded" }] });
    await vi.advanceTimersByTimeAsync(0);
    expect(sim.render().has(1)).toBe(false);
  });
});
