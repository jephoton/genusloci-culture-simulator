import { readFileSync } from "node:fs";
import { GeoFileSchema } from "@/geo/geo-file";
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { DEMO_CONFIG } from "@/ui/demo-config";
import { makeSyntheticCity } from "@/world/fixtures/synthetic-city";

// Offline reproducible baseline/opt-in comparison. Compare LINEAGE identities, not centroid indices.
// Counts are transitions after week 4, not unique residents; no guaranteed split or churn target.
const world = makeSyntheticCity(GeoFileSchema.parse(JSON.parse(readFileSync("public/geo/london.json", "utf8"))));
for (const seed of [7, 11, 23]) {
  for (const enabled of [false, true]) {
    const config = { ...DEFAULT_CONFIG, ...DEMO_CONFIG,
      ...(!enabled ? { residentialMoveRate: 0, residentTurnoverRate: 0, sceneSplitSimilarity: 0 } : {}) };
    const s = initState(world, config, seed);
    let moves = 0;
    let changes = 0;
    let switches = 0;
    let finalHalfMoves = 0;
    let milliseconds = 0;
    const identities = () => Array.from(s.scenes.assignment, (c) => c < 0 ? -1 : s.scenes.live[c]);
    let beforeScene = identities();
    for (let t = 0; t < 100 * config.ticksPerWeek; t++) {
      const homes = s.homeCell.slice();
      const started = performance.now();
      step(s);
      milliseconds += performance.now() - started;
      const scene = identities();
      if (t >= 4 * config.ticksPerWeek) {
        for (let i = 0; i < config.nAgents; i++) {
          if (homes[i] !== s.homeCell[i]) {
            moves++;
            if (t >= 50 * config.ticksPerWeek) finalHalfMoves++;
          }
          if (beforeScene[i] !== scene[i]) changes++;
          if (beforeScene[i] >= 0 && scene[i] >= 0 && beforeScene[i] !== scene[i]) switches++;
        }
      }
      beforeScene = scene;
    }
    const splits = s.scenes.events.filter((e) => e.tick >= 4 * config.ticksPerWeek && e.kind === "split").length;
    console.log(JSON.stringify({ seed, enabled, weeks: 100, lateMoves: moves, lateMembershipTransitions: changes,
      assignedSceneSwitches: switches, movesWeeks50To100: finalHalfMoves,
      lateSplits: splits, liveScenes: s.scenes.live.length, msPerTick: +(milliseconds / s.tick).toFixed(2) }));
  }
}
