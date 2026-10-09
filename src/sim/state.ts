import type { ActionLogEntry } from "@/sim/actions/schema";
import { DEFAULT_CONFIG, type SimConfig } from "@/sim/config";
import { addGene, cloneGenomes, createGenomes, type Genomes, genomeSimilarity } from "@/sim/genome";
import { createRng, type Rng } from "@/sim/rng";
import { cloneSceneState, createSceneState, type SceneState } from "@/sim/scenes/types";
import { addVenue, buildNearbyVenues } from "@/sim/venue-table";
import { type CompiledWorld, compileWorld, DEFAULT_VENUE_CAPACITY } from "@/sim/world-index";
import type { World } from "@/world/schema";

const FRIEND_CANDIDATES = 24;
const SAME_CELL_FRIEND_P = 0.7;

export type SimState = {
  tick: number;
  rngState: number;
  config: SimConfig;
  /** Shared and immutable; never cloned. */
  cw: CompiledWorld;

  // Agents: slots [0, alive.length); only slots with alive[i] === 1 take part.
  alive: Uint8Array;
  homeCell: Int32Array;
  energy: Float32Array;
  curiosity: Float32Array;
  /** slots × friendsPerAgent; -1 = empty. */
  friends: Int32Array;
  genomes: Genomes;
  /** Venue slot attended in the last tick, or -1. */
  attendance: Int32Array;

  // Venues: slots [0, nVenues) are in use; the table holds venueEntity.length slots.
  nVenues: number;
  venueEntity: Int32Array;
  venueCell: Int32Array;
  venueCapacity: Float32Array;
  /** slots × nEntities: 1 for the venue's entity, else edge weight entity→e. */
  venueProfile: Float32Array;
  venueOpen: Uint8Array;
  venueHealth: Float32Array;
  venueLowTicks: Int32Array;
  /** Visitors per venue in the last tick. */
  venueAttendance: Int32Array;
  /** Tick at which an event venue ends; -1 for permanent venues. */
  venueExpires: Int32Array;
  /** Event reach in km; 0 for permanent venues. */
  venueReach: Float32Array;
  /** Per cell: nearest open permanent venues. Rows are replaced, never mutated in place. */
  nearbyVenues: Int32Array[];
  /** Per cell rent multiplier (≥ 1): venues there need proportionally more visitors. */
  cellRent: Float32Array;

  scenes: SceneState;
  /** Successfully applied actions, in order. */
  log: ActionLogEntry[];
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

/** Samples up to `count` distinct genes from a weighted profile into the agent's genome. */
export function seedGenome(
  g: Genomes,
  agent: number,
  genes: { entity: number; weight: number }[],
  count: number,
  rng: Rng,
): void {
  const ws = genes.map((x) => x.weight);
  for (let n = 0; n < count; n++) {
    const k = pickWeighted(ws, rng);
    if (k === -1) break;
    addGene(g, agent, genes[k].entity, genes[k].weight * (0.5 + 0.5 * rng.next()));
    ws[k] = 0;
  }
}

/** Alive agents grouped by home cell, in slot order. */
export function agentsByCell(s: Pick<SimState, "alive" | "homeCell">, nCells: number): number[][] {
  const byCell: number[][] = Array.from({ length: nCells }, () => []);
  for (let i = 0; i < s.alive.length; i++) if (s.alive[i]) byCell[s.homeCell[i]].push(i);
  return byCell;
}

/** Fills agent i's friend row with the most taste-similar of a random sample of (mostly same-cell) agents. */
export function chooseFriends(
  s: Pick<SimState, "homeCell" | "genomes" | "friends" | "config">,
  i: number,
  byCell: number[][],
  rng: Rng,
): void {
  const F = s.config.friendsPerAgent;
  const nCells = byCell.length;
  const seen = new Set<number>();
  const scored: { c: number; sim: number }[] = [];
  for (let k = 0; k < FRIEND_CANDIDATES; k++) {
    const cell = rng.next() < SAME_CELL_FRIEND_P ? s.homeCell[i] : rng.int(nCells);
    const list = byCell[cell];
    if (list.length === 0) continue;
    const c = list[rng.int(list.length)];
    if (c === i || seen.has(c)) continue;
    seen.add(c);
    scored.push({ c, sim: genomeSimilarity(s.genomes, i, c) });
  }
  scored.sort((a, b) => b.sim - a.sim || a.c - b.c);
  s.friends.fill(-1, i * F, (i + 1) * F);
  scored.slice(0, F).forEach((x, k) => {
    s.friends[i * F + k] = x.c;
  });
}

export function initState(world: World, config: SimConfig = DEFAULT_CONFIG, seed = 1): SimState {
  const cw = compileWorld(world);
  const rng = createRng(seed);
  const n = config.nAgents;
  const slots = n + config.agentReserve;

  const alive = new Uint8Array(slots);
  alive.fill(1, 0, n);
  const homeCell = new Int32Array(slots);
  homeCell.set(allocateAgentsToCells(world.cells.map((c) => c.density), n));
  const genomes = createGenomes(slots);
  const energy = new Float32Array(slots);
  const curiosity = new Float32Array(slots);

  for (let i = 0; i < n; i++) {
    const cell = world.cells[homeCell[i]];
    const k = pickWeighted(cell.archetypes.map((a) => a.weight), rng);
    const archetype = k === -1 ? rng.int(world.archetypes.length) : cell.archetypes[k].archetype;
    seedGenome(genomes, i, world.archetypes[archetype].genes, config.initialGenes, rng);
    energy[i] = 0.5 + 0.5 * rng.next();
    curiosity[i] = rng.next();
  }

  const initialVenues = world.entities.flatMap((e, i) => (e.type === "place" && e.cell !== undefined ? [i] : []));
  const vSlots = initialVenues.length + config.venueReserve;

  const s: SimState = {
    tick: 0,
    rngState: 0,
    config,
    cw,
    alive,
    homeCell,
    energy,
    curiosity,
    friends: new Int32Array(slots * config.friendsPerAgent).fill(-1),
    genomes,
    attendance: new Int32Array(slots).fill(-1),
    nVenues: 0,
    venueEntity: new Int32Array(vSlots),
    venueCell: new Int32Array(vSlots),
    venueCapacity: new Float32Array(vSlots),
    venueProfile: new Float32Array(vSlots * cw.nEntities),
    venueOpen: new Uint8Array(vSlots),
    venueHealth: new Float32Array(vSlots),
    venueLowTicks: new Int32Array(vSlots),
    venueAttendance: new Int32Array(vSlots),
    venueExpires: new Int32Array(vSlots).fill(-1),
    venueReach: new Float32Array(vSlots),
    nearbyVenues: [],
    cellRent: new Float32Array(cw.nCells).fill(1),
    scenes: createSceneState(slots),
    log: [],
  };

  const byCell = agentsByCell(s, cw.nCells);
  for (let i = 0; i < n; i++) chooseFriends(s, i, byCell, rng);
  for (const e of initialVenues) {
    addVenue(s, e, world.entities[e].cell as number, world.entities[e].capacity ?? DEFAULT_VENUE_CAPACITY);
  }
  s.nearbyVenues = buildNearbyVenues(s);
  s.rngState = rng.state();
  return s;
}

/**
 * Deep copy of all mutable state. Every typed-array field is copied generically, so new fields are
 * safe by default. The compiled world is shared; nearbyVenues rows are shared because they are
 * only ever replaced, never mutated.
 */
export function cloneState(s: SimState): SimState {
  const out = { ...s };
  const src = s as unknown as Record<string, unknown>;
  const dst = out as unknown as Record<string, unknown>;
  for (const key of Object.keys(src)) {
    const value = src[key];
    if (ArrayBuffer.isView(value)) dst[key] = (value as Uint8Array).slice();
  }
  out.config = { ...s.config };
  out.genomes = cloneGenomes(s.genomes);
  out.nearbyVenues = [...s.nearbyVenues];
  out.scenes = cloneSceneState(s.scenes);
  out.log = [...s.log];
  return out;
}
