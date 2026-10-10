import type { SimConfig } from "@/sim/config";

/** Per-tick probability equivalent to weekly probability p: 1 − (1 − p)^(1/ticksPerWeek); exact identity at 1. */
export function perTick(p: number, ticksPerWeek: number): number {
  if (ticksPerWeek === 1) return p;
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 1 / ticksPerWeek);
}

/**
 * Per-tick share of a weekly expected count: rate / ticksPerWeek, so the expected number of events per week
 * stays `rate` (a per-tick probability via perTick would preserve P(at least one) instead, and inflate counts).
 */
export function perTickShare(rate: number, ticksPerWeek: number): number {
  return ticksPerWeek === 1 ? rate : rate / ticksPerWeek;
}

/** A duration in weeks as a whole number of ticks (at least 1 when weeks > 0). */
export function weeksToTicks(weeks: number, ticksPerWeek: number): number {
  return weeks <= 0 ? 0 : Math.max(1, Math.round(weeks * ticksPerWeek));
}

/** Outing multiplier for the day of `tick` (Mon = tick 0) with daily ticks; 1 for any other week length. */
export function weekdayFactor(config: Pick<SimConfig, "ticksPerWeek" | "weekdayWeights">, tick: number): number {
  if (config.ticksPerWeek !== 7) return 1;
  const w = config.weekdayWeights;
  const mean = w.reduce((a, b) => a + b, 0) / w.length || 1;
  return w[tick % w.length] / mean;
}
