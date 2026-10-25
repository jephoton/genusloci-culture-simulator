import { mkdir, writeFile } from "node:fs/promises";
import { runOfflineChat } from "../src/agents/offline-chat";
import type { ToolDeps } from "../src/agents/run-tool";
import type { CityContext } from "../src/agents/city";
import { makeTinyWorld } from "../src/world/fixtures/tiny-world";
import { initState } from "../src/sim/state";
import { DEFAULT_CONFIG } from "../src/sim/config";
import { step } from "../src/sim/step";
import { digest } from "../src/sim/digest";
import { buildFrame } from "../src/sim/frame";
import { whatIf } from "../src/sim/whatif";

// Evaluation prompts authored after the first parser implementation. Not a
// representative user study or a measured comparison with a live language model.
const cases = [
  ["summary", "read"], ["Give me an overview of this city", "read"],
  ["How do tastes evolve?", "read"], ["Why do people end up liking different things?", "read"],
  ["What if Alpha Club closes?", "compare"], ["What happens if we close Alpha Club?", "compare"],
  ["What would happen if Alpha Club closed?", "compare"], ["Compare Alpha Club staying open versus closing", "compare"],
  ["Would losing Alpha Club change the scene?", "compare"],
  ["close Alpha Club", "live"], ["Shut down Alpha Club", "live"],
  ["Don't close Alpha Club", "refuse"], ["apply that?!", "refuse"], ["I close Alpha Club", "refuse"],
] as const;

async function main() {
  const results = [];
  for (const [phrase, expected] of cases) {
    const world = makeTinyWorld(); world.entities[0].name = "Alpha Club";
    const state = initState(world, { ...DEFAULT_CONFIG, nAgents: 100, agentReserve: 0 }, 3);
    step(state);
    let writes = 0; let comparisons = 0;
    const d = digest(state);
    const ctx: CityContext = { world, digest: d, frame: buildFrame(state, "main", 0, true, 1).frame,
      layout: { center: { x: 0, z: 0 }, bounds: { minX: -1, maxX: 1, minZ: -1, maxZ: 1 }, cellX: new Float32Array(world.cells.length), cellZ: new Float32Array(world.cells.length) } };
    const deps: ToolDeps = { context: () => ctx, latestDigest: async () => d,
      act: async () => { writes++; return true; },
      whatIf: async (actions, weeks) => { comparisons++; return { result: whatIf(state, actions, weeks, 1) }; } };
    const result = await runOfflineChat(phrase, deps, { lastAction: { do: "close_venue", venue: 0 } });
    const actual = writes ? "live" : comparisons ? "compare" : result.supported ? "read" : "refuse";
    results.push({ phrase, expected, actual, correct: expected === actual, writes, comparisons });
  }
  const report = { cases: results, correct: results.filter((r) => r.correct).length, total: results.length,
    unintendedMutations: results.filter((r) => r.expected !== "live" && r.writes > 0).length,
    note: "Synthetic language-coverage challenge; no LLM provider, Qloo calls or real user validation." };
  await mkdir(".cache/spikes", { recursive: true });
  await writeFile(".cache/spikes/chat-language.json", JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
main().catch(() => { console.error("Language spike failed."); process.exitCode = 1; });
