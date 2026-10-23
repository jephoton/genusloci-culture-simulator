# Genus Loci

**A Qloo-grounded cultural ecology lab: ask a question, change a shared place, and follow what its simulated visitors do next.**

Genus Loci helps learners and technically curious people explore how individual tastes and shared places can produce collective cultural patterns. Instead of accepting an LLM's invented story about a venue closure, inspect a reproducible model, prepare an intervention, watch its recorded recent visitors and rewind to test another idea.

Qloo supplies catalogue venues, taste relationships, artist affinities and geographic heatmaps. The residents, learning rules and outcomes are authored simulation, not observed people or validated forecasts about businesses.

**Public demo:** [Genus Loci](https://genusloci-culture-simulator.vercel.app/) · **Current guide:** [Chat lab walkthrough](docs/chat-lab-walkthrough.md)

> Release note: the public URL was accessible on 2026-10-23, but still served the older sandbox interface. The current chat-first flow described here must be published before submission. See [judging alignment and release checks](docs/judging-alignment.md).

## The experience

1. Click **Play**, let residents make a few outings, then click **Pause**.
2. Ask **What's the busiest club?** Inspect its name, model health and recorded recent visitors.
3. Ask **What if <full venue name> closes?** The guide resolves the target and prepares a paired scenario/no-change comparison without modifying the live city.
4. Say **apply that**. The validated change is applied once and its focused case stays paused. Click **Play** when ready; **Pause** remains under your control.
5. Follow the recent visitor cohort and its current destinations. At a settling heuristic or observation cap, playback pauses and chat reports actual monitored outcomes.
6. Use **Change history** to rewind before the change. **Exit case/view** releases the highlight and leaves the city paused.

For artist/location comparison, open the separate **Plan an event** entry: choose an artist, find culturally matching existing venues, compare alternative hosts and optionally schedule an event in the model. This restored entry reuses the original comparison engine; it does not require an LLM. Its results are exploratory model evidence, not verified suitability or sales forecasts.

AI questions try Gemini, then Groq, then bounded deterministic interpretation. The AI guide can choose inspection, comparison and live Qloo lookup tools; explicit city mutations remain local and require the visitor's command. The fallback supports documented commands, not unrestricted language parity. No extra agent-purchase or LLM key is needed to try local commands.

The visible flow is a learning lab. Retained booking, resident-interview and sandbox code does not imply every legacy feature is exposed through the current UI.

## Why Qloo matters

| Qloo-derived input | Role in the model |
| --- | --- |
| Places, locations, kinds and taste tags | Venue catalogue, venue profiles and scene starting points |
| Artist recommendations and cultural affinities | Taste graph used in venue matching and adoption probabilities |
| Heatmaps | Geographic seeding; separate held-out maps support a limited spatial diagnostic |
| Live search and tag-affinity tools | Grounded cultural lookups available to the AI guide |

Removing Qloo would leave a functioning generic simulator, but remove the basis for its city-specific cultural relationships. Qloo provides cultural inputs; it does not validate the authored dynamics. We have not demonstrated superiority over an LLM-only baseline or real-world forecasting accuracy.

## Architecture

- **Simulation:** deterministic TypeScript in a Web Worker. Sparse tastes, outings, social exposure, drift/decay, venue health, scene clustering and lineage. Snapshot rewind and fork support reproducible experiments.
- **Agent:** Vercel AI SDK tool calling. City tools execute in the browser against the worker; Qloo tools run on the server. Provider fallback stops replay once answer/tool output begins.
- **Interface:** Next.js 16, React 19, React Three Fiber and Three.js. Actual venue landmarks, OSM streets, animated residents, relevant-only case inspection and manual playback.
- **Verification:** Vitest, ESLint and production TypeScript builds. Current task evidence and known limits live in [current state](docs/current-state.md).

## Run locally

Use Node 24 and pnpm 10.30.3.

```bash
pnpm install
cp .env.example .env.local
# Add QLOO_API_KEY to build a Qloo-grounded world.
# Optionally add GOOGLE_GENERATIVE_AI_API_KEY and/or GROQ_API_KEY for the AI guide.
pnpm build:world london
pnpm dev
```

Open localhost:3000. City builds write ignored `.cache/worlds/<city>.world.json`; they use live Qloo calls and cache matching requests. Costs depend on cache state and available signals. Other supported city slugs are `singapore` and `newyork` (see `src/geo/cities.ts` for the registry).

Without a built world or configured private world store, the app uses an explicitly identified synthetic fallback. That fallback is useful for setup/testing but does not demonstrate Qloo grounding. Without LLM credentials, local experiment commands still work. Provider configuration does not guarantee quota or availability.

```bash
pnpm test
pnpm lint
pnpm build
```

Externally hosted builds need the private world store configured and optional server-side provider credentials; see [.env.example](.env.example), [architecture](docs/architecture.md) and [world-build operations](docs/on-demand-world-builds.md). Never commit credentials, cached Qloo responses or built world files.

## Scope and evidence

Primary audience: learners, educators running exploratory demonstrations, and ALife/agent-based-modelling enthusiasts. Educational usefulness is a hypothesis; no learner study or practitioner validation has been completed. A closure case follows recorded recent visitor slots, not every causally affected resident. Observation caps and settling thresholds are model choices. Its post-playback summary is an observation, not a paired causal estimate. Resident routes/taste histories, saved concurrent branches and side-by-side animated baselines remain future work.

## Data and licences

- Code: [MIT](LICENSE), copyright Jethro Tan.
- Map data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL; see `public/geo`.
- Cultural data: [Qloo](https://www.qloo.com), used under the applicable hackathon terms; raw response caches and generated worlds stay out of Git.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). Submission copy: [Devpost draft](docs/devpost.md). Judge path: [pitch and demo](docs/pitch-and-demo.md).
