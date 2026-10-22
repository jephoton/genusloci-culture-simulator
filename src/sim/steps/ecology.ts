import type { Rng } from "@/sim/rng";
import type { SimState } from "@/sim/state";
import { agentsByCell, chooseFriends, pickWeighted, seedGenome } from "@/sim/state";
import { GENOME_CAP } from "@/sim/genome";
import { simToCentroid } from "@/sim/scenes/cluster";
import { perTick } from "@/sim/time";
import { distKm } from "@/sim/world-index";

/** Bounded home search (8 candidates) and gradual replacement, using only the simulation RNG.
 * Rent discourages moves into expensive cells; local scenes attract matching tastes. Moves require
 * a utility improvement, so there is no compulsory churn. Turnover keeps population constant.
 */
export function applyResidentialEcology(s: SimState, rng: Rng): { moves: number; replacements: number } {
  const moveP = perTick(s.config.residentialMoveRate, s.config.ticksPerWeek);
  const replaceP = perTick(s.config.residentTurnoverRate, s.config.ticksPerWeek);
  const result = { moves: 0, replacements: 0 };
  if (moveP === 0 && replaceP === 0) return result;
  const nCells = s.cw.nCells;
  const nScenes = s.scenes.centroids.length;
  const counts = new Int32Array(nCells * nScenes);
  const population = new Int32Array(nCells);
  for (let i = 0; i < s.alive.length; i++) {
    if (!s.alive[i]) continue;
    const cell = s.homeCell[i];
    population[cell]++;
    const scene = s.scenes.assignment[i];
    if (scene >= 0 && scene < nScenes) counts[cell * nScenes + scene]++;
  }
  const changed: number[] = [];
  const replaced = new Uint8Array(s.alive.length);
  for (let i = 0; i < s.alive.length; i++) {
    if (!s.alive[i]) continue;
    if (moveP > 0 && rng.next() < moveP && nCells > 1) {
      const home = s.homeCell[i];
      const affinity = s.scenes.centroids.map((c) => simToCentroid(s.genomes, i, c));
      const utility = (cell: number) => {
        let pull = 0;
        for (let c = 0; c < nScenes; c++) pull += affinity[c] * counts[cell * nScenes + c] / Math.max(1, population[cell]);
        return pull - 0.4 * Math.log(Math.max(1, s.cellRent[cell])) - 0.025 * distKm(s.cw, home, cell);
      };
      let best = home;
      let score = utility(home) + 0.015;
      for (let k = 0; k < 8; k++) {
        const cell = rng.int(nCells);
        if (s.cw.world.cells[cell].density <= 0) continue;
        const candidate = utility(cell);
        if (candidate > score) { best = cell; score = candidate; }
      }
      if (best !== home) { s.homeCell[i] = best; changed.push(i); result.moves++; }
    }
    if (replaceP > 0 && rng.next() < replaceP) {
      const cell = s.cw.world.cells[s.homeCell[i]];
      const k = pickWeighted(cell.archetypes.map((a) => a.weight), rng);
      const archetype = k < 0 ? rng.int(s.cw.world.archetypes.length) : cell.archetypes[k].archetype;
      const base = i * GENOME_CAP;
      s.genomes.ids.fill(-1, base, base + GENOME_CAP);
      s.genomes.w.fill(0, base, base + GENOME_CAP);
      seedGenome(s.genomes, i, s.cw.world.archetypes[archetype].genes, s.config.initialGenes, rng);
      s.energy[i] = 0.5 + 0.5 * rng.next();
      s.curiosity[i] = rng.next();
      s.attendance[i] = -1;
      s.attendanceHistory.fill(-1, i * s.config.ticksPerWeek, (i + 1) * s.config.ticksPerWeek);
      s.scenes.assignment[i] = -1;
      replaced[i] = 1;
      changed.push(i);
      result.replacements++;
    }
  }
  if (changed.length) {
    // A replacement does not inherit the previous resident's incoming friendships.
    for (let j = 0; j < s.friends.length; j++) if (s.friends[j] >= 0 && replaced[s.friends[j]]) s.friends[j] = -1;
    const byCell = agentsByCell(s, nCells);
    for (const i of new Set(changed)) chooseFriends(s, i, byCell, rng);
  }
  return result;
}
