import { computeFidelity } from "@/sim/calibration";
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

// Baseline run report for tuning: fidelity vs heatmaps plus ecology vitals, every 10 ticks.
// Uses the synthetic fixture until Plan 4 provides real World files.
const TICKS = 100;
const world = makeTinyWorld({ seed: 7, clusters: 6, entitiesPerCluster: 20, gridSize: 10 });
const s = initState(world, { ...DEFAULT_CONFIG, nAgents: 2000 }, 7);

const report = () => {
  const open = Array.from(s.venueOpen.subarray(0, s.nVenues)).filter((x) => x === 1).length;
  const genes = Array.from(s.genomes.ids).filter((x) => x >= 0).length;
  const alive = Array.from(s.alive).filter((x) => x === 1).length;
  console.log(
    `tick=${s.tick} fidelity=${computeFidelity(s).mean.toFixed(3)} venues=${open}/${s.nVenues} ` +
      `scenes=${s.scenes.live.length} genes/agent=${(genes / alive).toFixed(1)}`,
  );
};

report();
for (let t = 1; t <= TICKS; t++) {
  step(s);
  if (t % 10 === 0) report();
}
