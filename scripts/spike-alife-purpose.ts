import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { makeTinyWorld } from "../src/world/fixtures/tiny-world";
import { DEFAULT_CONFIG } from "../src/sim/config";
import { initState } from "../src/sim/state";
import { step } from "../src/sim/step";
import { computeFidelity } from "../src/sim/calibration";
import { hashState } from "../src/sim/hash";

// Synthetic-only parameter ablation. No API, provider or real World is loaded.
const world = makeTinyWorld({ seed: 7, clusters: 6, entitiesPerCluster: 20, gridSize: 10 });
function run(seed: number, friendBonus: number) {
  const state = initState(world, { ...DEFAULT_CONFIG, nAgents: 600, agentReserve: 0, friendBonus }, seed);
  const visits = new Float64Array(state.venueEntity.length);
  for (let tick = 0; tick < 52; tick++) {
    step(state);
    for (let venue = 0; venue < state.nVenues; venue++) visits[venue] += state.venueAttendance[venue];
  }
  const total = visits.reduce((a, b) => a + b, 0);
  assert(total > 0);
  const hhi = visits.reduce((a, b) => a + (b / total) ** 2, 0);
  assert(hhi > 0 && hhi <= 1);
  return { seed, friendBonus, hhi, fidelity: computeFidelity(state).mean, scenes: state.scenes.live.length, total, hash: hashState(state) };
}

async function main() {
  const rows = Array.from({ length: 10 }, (_, i) => ({ baseline: run(i + 1, 1.5), ablated: run(i + 1, 0) }));
  const repeatSeed1 = run(1, 1.5);
  assert.deepEqual(repeatSeed1, rows[0].baseline);
  const deltas = rows.map((row) => row.ablated.hhi - row.baseline.hhi);
  const report = {
    setup: { worldSeed: 7, clusters: 6, agents: 600, weeklyTicks: 52, seeds: 10, ablation: "friendBonus 1.5 to 0; other social mechanisms remain" },
    rows, meanHHIDelta: deltas.reduce((a, b) => a + b, 0) / deltas.length,
    positive: deltas.filter((x) => x > 0).length, negative: deltas.filter((x) => x < 0).length,
    repeatSeed1, repeatIdentical: true,
  };
  await mkdir(".cache/spikes", { recursive: true });
  await writeFile(".cache/spikes/alife-ablation.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}

main().catch(() => { console.error("Synthetic experiment failed."); process.exitCode = 1; });
