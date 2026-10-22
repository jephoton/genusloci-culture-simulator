import { expect, it } from "vitest";
import { DEFAULT_CONFIG } from "@/sim/config";
import { createRng } from "@/sim/rng";
import { cloneState, initState } from "@/sim/state";
import { applyResidentialEcology } from "@/sim/steps/ecology";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import { addGene } from "@/sim/genome";

it("disabled residential ecology consumes no randomness or state", () => {
  const s = initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 80 }, 7);
  const before = cloneState(s);
  const rng = createRng(21);
  applyResidentialEcology(s, rng);
  expect(s).toEqual(before);
  expect(rng.state()).toBe(21);
});

it("residents leave an expensive cell for cheaper sampled homes deterministically", () => {
  const s = initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 80, residentialMoveRate: 1 }, 7);
  s.homeCell.fill(0);
  s.cellRent[0] = 100;
  const copy = cloneState(s);
  const result = applyResidentialEcology(s, createRng(21));
  applyResidentialEcology(copy, createRng(21));
  expect(result.moves).toBeGreaterThan(60);
  expect(s.homeCell).toEqual(copy.homeCell);
  expect(s.alive).toEqual(copy.alive);
});

it("turnover refreshes residents while preserving population and reserve slots", () => {
  const s = initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 80, residentTurnoverRate: 1 }, 7);
  s.attendanceHistory.fill(0, 0, 80 * s.config.ticksPerWeek);
  const before = s.genomes.w.slice();
  const result = applyResidentialEcology(s, createRng(21));
  expect(result.replacements).toBe(80);
  expect(s.genomes.w).not.toEqual(before);
  expect(s.alive.reduce((a, b) => a + b, 0)).toBe(80);
  expect(s.attendance.every((v) => v === -1)).toBe(true);
  expect(s.attendanceHistory.every((v) => v === -1)).toBe(true);
  expect(s.genomes.ids.slice(80 * 32).every((id) => id === -1)).toBe(true);
});

it("local scene pull attracts matching residents and leaves settled residents at home", () => {
  const s = initState(makeTinyWorld(), { ...DEFAULT_CONFIG, nAgents: 80, residentialMoveRate: 1, friendsPerAgent: 0 }, 7);
  s.genomes.ids.fill(-1);
  s.genomes.w.fill(0);
  s.scenes.centroids = [new Float32Array(s.cw.nEntities), new Float32Array(s.cw.nEntities)];
  s.scenes.centroids[0][1] = 1;
  s.scenes.centroids[1][2] = 1;
  for (let i = 0; i < 80; i++) {
    const scene = i < 40 ? 0 : 1;
    s.homeCell[i] = scene === 0 ? 0 : 1 + i % 15;
    s.scenes.assignment[i] = scene;
    addGene(s.genomes, i, i === 0 ? 2 : scene + 1, 1);
  }
  applyResidentialEcology(s, createRng(21));
  expect(s.homeCell[0]).toBeGreaterThan(0);
  expect(s.homeCell[1]).toBe(0);
  expect(s.homeCell[79]).toBe(1 + 79 % 15);
});
