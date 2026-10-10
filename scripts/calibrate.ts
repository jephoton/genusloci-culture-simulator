import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GeoFileSchema } from "@/geo/geo-file";
import { computeFidelity } from "@/sim/calibration";
import { DEFAULT_CONFIG } from "@/sim/config";
import { initState } from "@/sim/state";
import { step } from "@/sim/step";
import { distKm } from "@/sim/world-index";
import { DEMO_CONFIG, DEMO_SEED } from "@/ui/demo-config";
import { makeSyntheticCity } from "@/world/fixtures/synthetic-city";
import { makeTinyWorld } from "@/world/fixtures/tiny-world";

// Baseline run report for tuning: fidelity vs heatmaps plus ecology vitals, every 10 ticks.
// - Default: the tiny synthetic fixture.
// - `--london`: the playable demo (public/geo/london.json, makeSyntheticCity, DEMO_CONFIG, DEMO_SEED),
//   with venue openings and closures per 10 weeks and a line per natural closure.
const london = process.argv.includes("--london");
const TICKS = Number(process.argv.find((a) => a.startsWith("--ticks="))?.slice(8) ?? 100);
/** A closure counts as "rival" if a venue that opened after it sits within this distance. */
const RIVAL_KM = 1;

const s = london
  ? initState(
      makeSyntheticCity(GeoFileSchema.parse(JSON.parse(readFileSync(join(process.cwd(), "public/geo/london.json"), "utf8")))),
      { ...DEFAULT_CONFIG, ...DEMO_CONFIG },
      DEMO_SEED,
    )
  : initState(makeTinyWorld({ seed: 7, clusters: 6, entitiesPerCluster: 20, gridSize: 10 }), { ...DEFAULT_CONFIG, nAgents: 2000 }, 7);

const isOpenPermanent = (v: number) => s.venueOpen[v] === 1 && s.venueExpires[v] < 0;
const openCount = () => Array.from({ length: s.nVenues }, (_, v) => v).filter(isOpenPermanent).length;
const startOpen = openCount();
const openedAt = new Int32Array(s.venueEntity.length).fill(-1);
let opens = 0;
let closes = 0;
let rivalCloses = 0;
let minOpen = startOpen;

const report = () => {
  const open = openCount();
  const genes = Array.from(s.genomes.ids).filter((x) => x >= 0).length;
  const alive = Array.from(s.alive).filter((x) => x === 1).length;
  const health = Array.from({ length: s.nVenues }, (_, v) => v).filter(isOpenPermanent).map((v) => s.venueHealth[v]).sort((a, b) => a - b);
  const median = health.length ? health[Math.floor(health.length / 2)] : 0;
  console.log(
    `tick=${String(s.tick).padStart(3)} fidelity=${computeFidelity(s).mean.toFixed(3)} open=${open} ` +
      (london ? `opens=${opens} closes=${closes} medianHealth=${median.toFixed(2)} ` : `venues=${open}/${s.nVenues} `) +
      `scenes=${s.scenes.live.length} genes/agent=${(genes / alive).toFixed(1)}`,
  );
  opens = 0;
  closes = 0;
};

report();
for (let t = 1; t <= TICKS; t++) {
  const before = s.nVenues;
  const wasOpen = s.venueOpen.slice(0, s.nVenues);
  step(s);
  for (let v = before; v < s.nVenues; v++) {
    if (s.venueExpires[v] >= 0) continue;
    openedAt[v] = s.tick;
    opens++;
  }
  for (let v = 0; v < before; v++) {
    if (!wasOpen[v] || s.venueOpen[v] || s.venueExpires[v] >= 0) continue;
    closes++;
    if (!london) continue;
    let rival = -1;
    let rivalKm = Infinity;
    for (let u = 0; u < s.nVenues; u++) {
      if (u === v || !isOpenPermanent(u) || openedAt[u] <= openedAt[v]) continue;
      const d = distKm(s.cw, s.venueCell[v], s.venueCell[u]);
      if (d < rivalKm) {
        rivalKm = d;
        rival = u;
      }
    }
    const isRival = rival >= 0 && rivalKm <= RIVAL_KM;
    if (isRival) rivalCloses++;
    console.log(
      `  week ${s.tick}: closed ${s.cw.world.entities[s.venueEntity[v]].name} (slot ${v}, opened week ${Math.max(0, openedAt[v])})` +
        (isRival ? `, newer rival ${s.cw.world.entities[s.venueEntity[rival]].name} ${rivalKm.toFixed(2)} km away` : ", no newer rival nearby"),
    );
  }
  minOpen = Math.min(minOpen, openCount());
  if (t % 10 === 0) report();
}

if (london) {
  console.log(
    `summary: start=${startOpen} end=${openCount()} min=${minOpen} (${((100 * minOpen) / startOpen).toFixed(0)}% of start) ` +
      `auto-opens=${openedAt.filter((x) => x > 0).length} closures=${countCloses()} rival-closures=${rivalCloses}`,
  );
}

function countCloses(): number {
  let n = 0;
  for (let v = 0; v < s.nVenues; v++) if (!s.venueOpen[v] && s.venueExpires[v] < 0) n++;
  return n;
}
