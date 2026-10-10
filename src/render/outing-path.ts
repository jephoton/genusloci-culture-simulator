import { hash01 } from "@/render/layout";

/**
 * A tick (one simulated day in the demo; a week with weekly ticks) is drawn as a night out: agents
 * leave home in staggered waves, gather at their venue, then walk home before the next tick. All values
 * are fractions of the tick.
 */
const MAX_STAGGER = 0.2;
const TRAVEL = 0.25;
/** Every agent has arrived by this phase (latest departure + travel). */
export const ARRIVE_AT = MAX_STAGGER + TRAVEL;
/** No agent heads home before this phase. */
export const RETURN_AT = 0.62;
const RETURN_STAGGER = 0.6;

/** Per-agent departure offset in [0, MAX_STAGGER): deterministic, so waves are stable across ticks. */
export function staggerOf(agent: number): number {
  return hash01(agent * 7 + 11) * MAX_STAGGER;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/**
 * Linear progress (callers ease it) of the outbound leg (home → venue) and the return leg
 * (venue → home) at tick phase `t` for an agent with departure offset `stagger`.
 */
export function outingPhase(t: number, stagger: number): { out: number; back: number } {
  return {
    out: clamp01((t - stagger) / TRAVEL),
    back: clamp01((t - (RETURN_AT + stagger * RETURN_STAGGER)) / TRAVEL),
  };
}
