import { decayGenome } from "@/sim/genome";
import type { SimState } from "@/sim/state";

/** Unreinforced tastes fade; genes below minWeight are forgotten. */
export function applyDecay(s: SimState): void {
  const { decayRate, minWeight } = s.config;
  for (let i = 0; i < s.homeCell.length; i++) decayGenome(s.genomes, i, decayRate, minWeight);
}
