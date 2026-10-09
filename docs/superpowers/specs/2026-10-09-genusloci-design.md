# Genus Loci — Design Spec

- **Repo:** `jephoton/genusloci-culture-simulator` (planned; not yet created)
- **Hackathon:** Qloo Agentic Hackathon ("Agents, but with taste"), deadline 2026-10-31 11:45 GMT+8
- **Status:** Draft skeleton, approved in brainstorming 2026-10-09. Expected to be refined during build.

## 1. One-liner

*Every city's culture is a living species.* Genus Loci is a god-game sandbox of a real city's cultural ecosystem. Thousands of agents carry taste genomes built from real Qloo entities. Venues compete for their attention, and scenes are born, split, migrate and go extinct. You poke the city (close a venue, open one, bring in migrants, throw a festival) and watch the ecosystem respond. An AI co-pilot can do everything the toolbar does, explain what happened, and let you interview individual residents.

## 2. Hackathon constraints that shape the design

| Constraint | Design consequence |
|---|---|
| Must be agentic (agent framework, agentic tool, or Qloo inside an agent) | An LLM tool-use co-pilot drives the same action layer as the UI; persona agents; scene-naming agent. |
| "If it works the same without Qloo, you're building the wrong thing" | The simulation's rules are the Qloo graph: every adoption and drift follows a Qloo affinity edge, and the baseline is calibrated against Qloo heatmaps. |
| Hosted, publicly usable demo; no video | Must be self-explanatory: guided first scenario, instant prebuilt cities, judges can try their own city. |
| Public repo + OSS license | MIT. **No Qloo response data committed** (Qloo terms); World files are cached server-side only. |
| Hackathon key: `https://hackathon.api.qloo.com`, `X-Api-Key` header, unknown rate limits | All Qloo calls go through one server-side client with caching, throttling and retries. Simulation ticks make zero API calls. |
| Judging: Tech implementation, Design, Potential Impact, Quality of Idea | Calibration score shown in the UI (tech), polished god-game UX (design), venue/scene-planning pitch (impact), alife + taste graph (idea). |

## 3. Users and problem

**Primary pitch audience:** independent venues, promoters, and city/night-time-economy culture planners.

**Problem:** cultural scenes are ecosystems. Closing a grassroots venue, opening a new one, a big tour, rent rises or a migrant community arriving all ripple through a city's culture in ways nobody can see in advance. Grassroots venue closures are a recognised crisis (e.g. the UK's Music Venue Trust). Decisions today rely on gut feel.

**What Genus Loci gives them:** a scenario sandbox grounded in real taste data. They can ask "what happens to this scene if X closes?", "where is this scene drifting?", or "what niche is this neighbourhood missing?" (empty niches in taste-space are literal answers). It is a tool for exploring scenarios, not an oracle; the UI says so, and shows how closely the baseline matches reality.

**Secondary appeal:** curiosity and play. Judges should enjoy messing with their own city.

## 4. Product experience

1. **Landing:** pick a prebuilt city (London first; then e.g. NYC, Tokyo, Singapore) or type any city ("Build a world", ~1–2 min, cached after).
2. **The map (main canvas):** agents as particles coloured by scene, venues as pulsing nodes sized by health, optional geohash heat layer. A time control at the bottom: play/pause, speed, rewind.
3. **God toolbar:** close venue, open venue (search a real Qloo place/entity, or "fill the empty niche"), schedule event, migrate population (choose a source city), rent pressure on an area.
4. **Side panels:**
   - **Phylogeny:** a live tree of scenes showing births, splits, merges and extinctions. Scenes are named by an LLM from their top Qloo entities.
   - **Inspector:** click a venue, scene, or agent to see its genome (real Qloo entities and tags) and its history.
   - **Co-pilot chat:** natural-language scenarios, explanations, comparisons.
5. **Interview:** from the inspector, chat with an individual agent; the persona speaks from its genome and its personal history.
6. **Compare:** fork the timeline before a shock and view the baseline and intervention runs side by side, plus a metrics diff.
7. **Judge onboarding:** a 60-second guided scenario on first load (e.g. "This London venue closes. Watch what happens to its scene."), skippable.

## 5. Architecture

```
┌────────────── Browser (Next.js client) ───────────────┐
│  Map (deck.gl + MapLibre) · Phylogeny · Inspector     │
│  Toolbar ─┐                       Co-pilot chat ─┐    │
│           ▼                                      │    │
│      Action layer (typed commands) ◄─────────────┘    │
│           │  postMessage                              │
│           ▼                                           │
│      Sim Web Worker (pure TS, typed arrays, seeded)   │
└───────────┬───────────────────────────┬───────────────┘
            │ GET world                 │ co-pilot / persona requests (streamed)
┌───────────▼───────────────────────────▼───────────────┐
│  Next.js route handlers (Vercel)                      │
│  World builder ── Qloo client (cache, throttle)       │
│  Agent runtime ── LLM via AI SDK (tool use)           │
│  World cache (server-side blob/KV store)              │
└───────────────────────────────────────────────────────┘
```

### Units and boundaries

| Unit | Responsibility | Depends on |
|---|---|---|
| `qloo/` client | Typed wrappers for search, insights, tags, audiences, heatmap. Validates params and IDs; caches; throttles; retries. | Qloo API |
| `world/` builder | City → World file (entities, edges, heatmaps, archetypes). Resumable, step-wise build. | `qloo/`, cache |
| `sim/` engine | Pure, deterministic `step(state, actions, rng) → state`. No DOM, no network. Kept portable (could move to Rust/WASM later; not planned). | World file only |
| `sim/worker` | Hosts the engine in a Web Worker; snapshots for rewind and forks; emits digests. | `sim/` |
| `actions/` | One command schema used by the toolbar and the co-pilot. Validation and serialisation. | — |
| `agents/` | Co-pilot loop, persona interview, scene naming. Server-side. | LLM providers (via AI SDK), `qloo/`, action schema |
| `ui/` | Map, panels, toolbar, chat. | worker, actions, agents API |

Co-pilot simulation tools execute **client-side**: the server agent loop emits a tool call, the browser runs it against the worker, and the result is posted back. The simulation lives only in the browser; the server stays stateless apart from caches.

## 6. World builder (Qloo usage)

For a city, build once and cache:

1. **Anchor discovery:** Insights queries for top entities in the city (`filter.location.query=<city>`) across types: places/venues, artists, brands, films/TV. Use `diversify` so results span the city.
2. **Audiences/archetypes:** pull 10–30 audience communities (`filter.parents.types=urn:audience:communities`). For each, Insights with `signal.demographics.audiences` + city location → that archetype's entity affinities.
3. **Affinity edges:** for each anchor entity, Insights with `signal.interests.entities=<id>` → related entities and their affinity scores (take ≤ 50). Unseen entities above a threshold are added until the entity cap (~500–2,000) is reached.
4. **Heatmaps:** `filter.type=urn:heatmap`, `output.heatmap.boundary=urn:geohash`, signalled by each archetype and a sample of anchors → per-cell affinity. Drives agent placement and calibration targets.
5. **Explainability:** `feature.explainability=true` on archetype queries, stored for inspector "why" text.
6. **Compile:** a compact World JSON (entity table, sparse edge list, cell grid, archetypes, heatmaps) with a version number, gzipped, stored in a server-side cache (Vercel Blob or KV; choice deferred to the plan).

**Call budget:** roughly 200–600 Qloo calls per city (to be measured in the spike). Builds run as resumable steps so they survive serverless timeouts and rate limits, and report progress to the UI. Prebuilt cities are built ahead of time with a CLI script against the same builder.

**Caveats to handle:** invalid params are silently ignored, so an empty 200 response is treated as a validation failure, not "no results"; `/search` `types` differ from `filter.type`; audience/tag values must be URNs or IDs.

## 7. Simulation engine

- **Time:** 1 tick = 1 simulated week.
- **People agents (~5,000, tunable):** home cell (placed by heatmap density); genome = sparse weighted vector of ~20–40 entity/tag IDs (seeded from the archetype matched to their cell, plus noise); ~10 friends (similar taste and nearby); outing energy; curiosity.
- **Venue agents:** real Qloo places; genome from their Qloo tags and neighbours; capacity; health = rolling average of attendance. Close below threshold for N ticks. New venues open into **empty niches** (taste-space regions with demand but no nearby supply), with genomes from real Qloo entities nearest the niche.
- **Per tick:**
  1. **Outing:** each agent chooses a venue (or stays home), weighted by genome affinity, distance, and where friends are going.
  2. **Exposure:** attendees are exposed to the venue's genome and to co-attendees' genomes.
  3. **Adoption:** P(adopt e) rises with how strongly e links (via Qloo edges) to the current genome, and with the amount of exposure.
  4. **Drift (mutation):** small-probability step to a Qloo neighbour of an existing gene.
  5. **Decay:** unreinforced weights fade; tiny weights are pruned.
- **Scenes:** every K ticks, cluster agents by genome similarity (k-medoids over cosine similarity). Match clusters to the previous ones by member overlap to track lineages → birth/split/merge/extinction events → phylogeny. Names are generated by an LLM from top entities and cached per lineage.
- **Calibration:** in a baseline run with no shocks, compute per-cell rank correlation between the simulated following of anchor entities and their Qloo heatmaps. Tune a few global settings (outing rate, decay, drift, social weight) offline per city. The UI shows "Baseline fidelity ρ = 0.xx".
- **Determinism:** seeded RNG; state snapshots every N ticks for rewind and forking.
- **Performance target:** ≥ 10 ticks/sec at 5,000 agents on a mid-range laptop; rendering at 60 fps, decoupled from the tick rate.

## 8. Action layer

Typed, serialisable commands, validated with zod and shared by the toolbar and the co-pilot:

`closeVenue(venueId)`, `openVenue({entityId | nicheId, cell})`, `scheduleEvent({entityId, cell, tick, reach})`, `migrate({sourceCity, count, cells})`, `rentPressure({cells, magnitude})`, `run({ticks})`, `fork()`, `rewind({tick})`.

The worker logs every action with its tick, so runs can be replayed and the co-pilot can see what the user just did.

## 9. Agents

- **Co-pilot** (LLM tool-use loop, server-side, streamed):
  - **Qloo tools:** `search_entity`, `get_related`, `get_heatmap`, `get_audiences`. These are validated wrappers; the agent can only reference IDs that actually resolved.
  - **Sim tools** (executed in the browser): `get_world_summary` (compact digest: top scenes, venue health, recent events, recent user actions), all action commands, `get_metrics`, `compare_runs`, `inspect(id)`.
  - **Behaviour:** turns the question into a scenario, runs it with a baseline fork, reports with numbers from the sim and named Qloo entities, and is honest about uncertainty.
- **Persona interview:** a single-agent context (genome, history, scene, home cell) → first-person chat. Grounded; must not invent tastes outside its genome.
- **Scene namer:** a small, cheap LLM call per new lineage.
- **Models (provider-agnostic, see decision 0003):** all LLM calls go through the Vercel AI SDK using OpenAI-compatible providers, so swapping is a config change. **Primary: DeepSeek API** (open-weight, low cost) for the co-pilot. **Fallback chain** on rate limits or errors: free tiers of Groq → Cerebras → OpenRouter → Gemini. Two tiers: a larger tool-calling model for the co-pilot, a small fast model for personas and scene naming. Exact models and limits to be verified in the Phase 1 spike.
- **Open-model robustness:** keep the co-pilot tool set small and strictly typed (zod); validate every tool call and return structured errors so the model can retry; cap the loop's steps.
- **Abuse/cost guard:** per-IP rate limits and a daily budget cap on LLM calls in the public demo.

## 10. Stack and hosting

- TypeScript throughout. Next.js (App Router) on Vercel. pnpm.
- Rendering: deck.gl + MapLibre GL (free vector tiles, no paid map key if possible).
- Sim: Web Worker with typed arrays. Validation: zod.
- Server cache: Vercel Blob or KV (decided in the plan).
- LLM: Vercel AI SDK; DeepSeek primary, free-tier fallback chain (decision 0003).
- Secrets: `QLOO_API_KEY`, `DEEPSEEK_API_KEY` and fallback provider keys as Vercel environment variables only; `.env.example` in the repo.
- License: MIT.

## 11. Error handling

- **Qloo:** retry with backoff on 429/5xx; treat empty 200 responses as possible invalid params and log them; resumable world builds; fall back to a cached World file.
- **LLM:** streaming with timeouts; the co-pilot degrades to "toolbar only" with a clear notice if the budget is exhausted or every provider in the fallback chain is down.
- **Sim:** validate actions before applying them; the worker catches errors and reports them without killing the UI; World files are checked against their schema version on load.

## 12. Testing

- **Sim engine:** unit tests for the pure step functions (adoption, drift, decay, venue lifecycle, scene tracking) using a small hand-made World fixture with synthetic, non-Qloo data. Determinism test: same seed gives the same state hash.
- **Qloo client:** contract tests against recorded responses kept outside the repo (or synthetic fixtures), plus a live smoke-test script.
- **World builder:** a schema validation test on output.
- **Agents:** tool-schema tests; a scripted end-to-end test of a co-pilot scenario using a mocked model.
- **UI:** Playwright smoke test: load a city, close a venue, see a scene event.
- **Calibration:** a reported metric per prebuilt city, not a pass/fail test.

## 13. Build order (relative, not dated)

1. **Qloo spike and World builder:** get the key working, explore the endpoints, build a London World. The engine and UI can start in parallel on a synthetic World fixture while the key is pending.
2. **Simulation engine:** agents, tick loop, venue lifecycle, scene tracking, calibration.
3. **God-game UI:** map, toolbar, timeline, phylogeny, inspector.
4. **Agents:** co-pilot, personas, scene naming.
5. **Polish and cities:** prebuilt cities, build-your-own-city flow, onboarding scenario, compare view.
6. **Ship:** deploy, README, license in the About section, Devpost write-up, bug buffer.

## 14. Risks and open questions

- **Qloo rate limits are unknown.** Measure in the spike; ask in Discord #api-help if needed.
- **Heatmap coverage per entity type is unknown**, and so is whether audience communities are city-meaningful. Verify in the spike; fall back to tag-based archetypes.
- **Calibration may be weak.** Present it honestly; it is still a differentiator.
- **Serverless timeouts during on-demand world builds:** handled by resumable steps.
- **Visual clutter at 5,000 agents:** use aggregation or level-of-detail on the map.
- **Scope:** migration and rent pressure are the first shocks to cut if time runs short; close/open venue and events are core.

## 15. Out of scope (for now)

User accounts, saved/shared scenarios (maybe a stretch goal via URL-encoded action logs), a Rust/WASM engine, mobile-first layout, the taste-space (non-map) view (stretch).
