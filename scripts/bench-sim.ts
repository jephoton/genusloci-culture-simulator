import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

const TARGET_TICKS_PER_SEC = 10;
const TICKS = 50;

const world = makeTinyWorld({ seed: 7, clusters: 20, entitiesPerCluster: 50, gridSize: 20 });
let t0 = performance.now();
const s = initState(world, DEFAULT_CONFIG, 7);
const initMs = performance.now() - t0;

t0 = performance.now();
for (let t = 0; t < TICKS; t++) step(s);
const tps = TICKS / ((performance.now() - t0) / 1000);

console.log(
  `agents=${DEFAULT_CONFIG.nAgents} entities=${world.entities.length} venues=${s.nVenues} ` +
    `cells=${world.cells.length} init=${initMs.toFixed(0)}ms ticks/sec=${tps.toFixed(1)}`,
);
if (tps < TARGET_TICKS_PER_SEC) {
  console.error(`FAIL: ${tps.toFixed(1)} ticks/sec is below the ${TARGET_TICKS_PER_SEC} target`);
  process.exit(1);
}
