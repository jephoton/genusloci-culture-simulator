import { DEFAULT_CONFIG, type SimConfig } from "@/sim/config";
import { addGene, cloneGenomes, createGenomes, type Genomes, genomeSimilarity } from "@/sim/genome";
import { createRng, type Rng } from "@/sim/rng";
import { type CompiledWorld, compileWorld } from "@/sim/world-index";
import type { World } from "@/world/schema";

const FRIEND_CANDIDATES = 24;
const SAME_CELL_FRIEND_P = 0.7;

export type SimState = {
  tick: number;
  rngState: number;
  config: SimConfig;
  /** Shared and immutable; never cloned. */
  cw: CompiledWorld;
  homeCell: Int32Array;
  energy: Float32Array;
  curiosity: Float32Array;
  /** nAgents × friendsPerAgent; -1 = empty. */
  friends: Int32Array;
  genomes: Genomes;
  /** Venue slot attended in the last tick, or -1. */
  attendance: Int32Array;
  venueOpen: Uint8Array;
  venueHealth: Float32Array;
  venueLowTicks: Int32Array;
  /** Visitors per venue in the last tick. */
  venueAttendance: Int32Array;
};

/** Index of a weighted random choice, or -1 if all weights are 0. */
export function pickWeighted(weights: ArrayLike<number>, rng: Rng): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) total += weights[i];
  if (total <= 0) return -1;
  let r = rng.next() * total;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    if (weights[i] <= 0) continue;
    last = i;
    r -= weights[i];
    if (r < 0) return i;
  }
  return last;
}

/** Largest-remainder allocation of n agents to cells by density (deterministic). */
export function allocateAgentsToCells(densities: number[], n: number): Int32Array {
  const total = densities.reduce((a, b) => a + b, 0);
  const shares = total > 0 ? densities.map((d) => (d / total) * n) : densities.map(() => n / densities.length);
  const counts = shares.map(Math.floor);
  let remaining = n - counts.reduce((a, b) => a + b, 0);
  const order = shares
    .map((s, i) => ({ i, frac: s - Math.floor(s) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remaining > 0; k++, remaining--) counts[order[k % order.length].i]++;
  const out = new Int32Array(n);
  let a = 0;
  counts.forEach((c, cell) => {
    for (let j = 0; j < c; j++) out[a++] = cell;
  });
  return out;
}

function seedGenome(g: Genomes, agent: number, archetype: World["archetypes"][number], count: number, rng: Rng) {
  const ws = archetype.genes.map((x) => x.weight);
  for (let n = 0; n < count; n++) {
    const k = pickWeighted(ws, rng);
    if (k === -1) break;
    addGene(g, agent, archetype.genes[k].entity, archetype.genes[k].weight * (0.5 + 0.5 * rng.next()));
    ws[k] = 0;
  }
}

function buildFriends(homeCell: Int32Array, genomes: Genomes, nCells: number, F: number, rng: Rng): Int32Array {
  const n = homeCell.length;
  const byCell: number[][] = Array.from({ length: nCells }, () => []);
  for (let i = 0; i < n; i++) byCell[homeCell[i]].push(i);
  const friends = new Int32Array(n * F).fill(-1);
  for (let i = 0; i < n; i++) {
    const seen = new Set<number>();
    const scored: { c: number; sim: number }[] = [];
    for (let s = 0; s < FRIEND_CANDIDATES; s++) {
      const cell = rng.next() < SAME_CELL_FRIEND_P ? homeCell[i] : rng.int(nCells);
      const list = byCell[cell];
      if (list.length === 0) continue;
      const c = list[rng.int(list.length)];
      if (c === i || seen.has(c)) continue;
      seen.add(c);
      scored.push({ c, sim: genomeSimilarity(genomes, i, c) });
    }
    scored.sort((a, b) => b.sim - a.sim || a.c - b.c);
    scored.slice(0, F).forEach((x, k) => {
      friends[i * F + k] = x.c;
    });
  }
  return friends;
}

export function initState(world: World, config: SimConfig = DEFAULT_CONFIG, seed = 1): SimState {
  const cw = compileWorld(world, config.maxNearby);
  const rng = createRng(seed);
  const n = config.nAgents;
  const homeCell = allocateAgentsToCells(world.cells.map((c) => c.density), n);
  const genomes = createGenomes(n);
  const energy = new Float32Array(n);
  const curiosity = new Float32Array(n);

  for (let i = 0; i < n; i++) {
    const cell = world.cells[homeCell[i]];
    const k = pickWeighted(cell.archetypes.map((a) => a.weight), rng);
    const archetype = k === -1 ? rng.int(world.archetypes.length) : cell.archetypes[k].archetype;
    seedGenome(genomes, i, world.archetypes[archetype], config.initialGenes, rng);
    energy[i] = 0.5 + 0.5 * rng.next();
    curiosity[i] = rng.next();
  }

  const friends = buildFriends(homeCell, genomes, world.cells.length, config.friendsPerAgent, rng);
  const nV = cw.venues.length;

  return {
    tick: 0,
    rngState: rng.state(),
    config,
    cw,
    homeCell,
    energy,
    curiosity,
    friends,
    genomes,
    attendance: new Int32Array(n).fill(-1),
    venueOpen: new Uint8Array(nV).fill(1),
    venueHealth: new Float32Array(nV).fill(0.5),
    venueLowTicks: new Int32Array(nV),
    venueAttendance: new Int32Array(nV),
  };
}

/** Deep copy of all mutable state (the compiled world is shared). */
export function cloneState(s: SimState): SimState {
  return {
    ...s,
    config: { ...s.config },
    homeCell: s.homeCell.slice(),
    energy: s.energy.slice(),
    curiosity: s.curiosity.slice(),
    friends: s.friends.slice(),
    genomes: cloneGenomes(s.genomes),
    attendance: s.attendance.slice(),
    venueOpen: s.venueOpen.slice(),
    venueHealth: s.venueHealth.slice(),
    venueLowTicks: s.venueLowTicks.slice(),
    venueAttendance: s.venueAttendance.slice(),
  };
}
