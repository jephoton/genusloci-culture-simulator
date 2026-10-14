import { GENOME_CAP } from "@/sim/genome";
import { simToCentroid } from "@/sim/scenes/cluster";
import type { SimState } from "@/sim/state";

export type ResidentProfile = {
  agent: number;
  homeCell: number;
  /** Lineage id of the resident's scene, or -1. */
  scene: number;
  /** Venue slot they went to on the last tick, or -1. */
  venue: number;
  /** Their tastes, strongest first. */
  genes: { entity: number; weight: number }[];
};

export function residentProfile(s: SimState, agent: number): ResidentProfile {
  const genes: { entity: number; weight: number }[] = [];
  for (let k = 0; k < GENOME_CAP; k++) {
    const slot = agent * GENOME_CAP + k;
    if (s.genomes.ids[slot] >= 0) genes.push({ entity: s.genomes.ids[slot], weight: Math.round(s.genomes.w[slot] * 100) / 100 });
  }
  genes.sort((a, b) => b.weight - a.weight || a.entity - b.entity);
  const a = s.scenes.assignment[agent];
  return { agent, homeCell: s.homeCell[agent], scene: a >= 0 ? s.scenes.live[a] : -1, venue: s.attendance[agent], genes };
}

/**
 * A typical member of a live scene: the living member whose taste is closest to the scene's centroid,
 * skipping the `skip` nearest ones (so "talk to another" meets someone new). Null if none.
 */
export function typicalResident(s: SimState, scene: number, skip = 0): number | null {
  const a = s.scenes.live.indexOf(scene);
  if (a < 0) return null;
  const centroid = s.scenes.centroids[a];
  const members: { agent: number; sim: number }[] = [];
  for (let i = 0; i < s.scenes.assignment.length; i++) {
    if (s.alive[i] && s.scenes.assignment[i] === a) members.push({ agent: i, sim: simToCentroid(s.genomes, i, centroid) });
  }
  if (members.length === 0) return null;
  members.sort((x, y) => y.sim - x.sim || x.agent - y.agent);
  return members[Math.min(skip, members.length - 1)].agent;
}
