import { decayGenome } from "@/sim/genome";
import type { SimState } from "@/sim/state";
import { perTick } from "@/sim/time";

/** Unreinforced tastes fade; genes below minWeight are forgotten. */
export function applyDecay(s: SimState): void {
  const { decayRate, minWeight, ticksPerWeek } = s.config;
  const rate = perTick(decayRate, ticksPerWeek);
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i]) decayGenome(s.genomes, i, rate, minWeight);
}
