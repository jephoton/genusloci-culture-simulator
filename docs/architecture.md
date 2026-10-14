# Architecture — Genus Loci

<!-- generated: maintained by agents; keep in sync with the spec -->

**Goal:** a god-game sandbox of a real city's cultural ecosystem, grounded in Qloo's taste graph, built for the Qloo Agentic Hackathon (deadline 2026-10-31 11:45 GMT+8).

**Full design:** [superpowers/specs/2026-10-09-genusloci-design.md](superpowers/specs/2026-10-09-genusloci-design.md)

## Components

- **`qloo/`** — server-side Qloo client (findings in [qloo-notes.md](qloo-notes.md)). No Next.js imports, so the CLI scripts use it too:
  - `transport.ts` — URL building, at most 4 request starts per second, retries (429 waits for the reset header; 5xx and network errors back off), a monthly-quota floor (`QlooBudgetError`), and caching of parsed results and deterministic 400s (`isInvalidSignal`)
  - `cache.ts` — `memoryCache`, `fileCache` (`.cache/qloo`, git-ignored)
  - `schemas.ts` — zod parsing that trims verbose responses to `QEntity`, `QTag`, `QHeatCell`, `QAudience` and `QDemographics`
  - `validate.ts` — rejects values Qloo would silently ignore (non-URN tags and audiences, non-UUID IDs, a `take` outside 1–50, bad coordinates)
  - `client.ts` — `search`, `entities`, `places`, `recommend`, `tagAffinities`, `heatmap` (clipped to the radius), `demographics`, `audienceTypes`, `audiences`, `searchTags`; `onSuspectEmpty` fires for empty results that carried a filter or signal
  - `env.ts` — `qlooFromEnv()` (`QLOO_API_KEY`, optional `QLOO_BASE_URL` and `QLOO_BUDGET_FLOOR`, default 200)
- **`geo/`** — OpenStreetMap pipeline: `geometry.ts` (simplify, clip, ring assembly), `overpass.ts` (query + parser → World `geo`), `cities.ts` (registry), `geo-file.ts` (file schema). Prebuilt city geometry lives in `public/geo/<city>.json` under ODbL (decision 0006); the app shows OSM attribution.
- **`world/`** — World schema (`schema.ts`, with optional `meta` for source and attribution), projection, the shared street-density grid (`grid.ts`), synthetic fixtures, and the Qloo world builder:
  - `builder/kinds.ts` — one union-of-tags place query per venue kind; `kindOf` from a venue's own genre/category tags; relative capacity by kind
  - `builder/gather.ts` — the only Qloo-calling part: venues per kind, artists for anchor venues (skipping venues Qloo can't use as signals), seed and check heatmaps per scene
  - `builder/assemble.ts` — pure: venues (fair across kinds, at most 4 per 300 m cell, extras kept as reserve places), taste tags, music tags, artists, symmetric edges, spherical k-means archetypes named by distinctive tags, venue-kernel cell mixes; `applySeedHeatmaps` re-seeds cells from Qloo heatmaps; `attachHeatmaps` adds the held-out fidelity heatmaps
  - `builder/equilibrate.ts` — runs the baseline with closures off and blends measured weekly visits into venue capacities
  - World files are written to `.cache/worlds/<city>.world.json` (git-ignored) and served by `app/api/world/[slug]`; never commit them (Qloo terms)
- **`sim/`** — pure, deterministic TypeScript engine (no network, no DOM), hosted in a Web Worker:
  - `state.ts` + `venue-table.ts` — agent slots with an `alive` mask; per-state venue table; expired event slots are reused (decision 0004)
  - `steps/` — outing → attendance → exposure/adoption → drift → decay → venue lifecycle (events, rent)
  - `actions/` — zod action schema shared by the toolbar and the co-pilot; `applyAction` (close/open venue, event, migrate, rent pressure)
  - `scenes/` — warm-started spherical k-means scenes + lineage tracking (birth/split/merge/extinction)
  - `niches.ts` — unmet-demand niches; auto-opens matching real places
  - `calibration.ts` — Spearman fidelity against Qloo heatmaps
  - `digest.ts` — compact serialisable summary for the UI and co-pilot
  - `timeline.ts` — snapshots, exact rewind (snapshot + action-log replay), fork
  - `frame.ts` — transferable per-tick render `Frame`
  - `worker/` — Web Worker host (zod-validated config and actions; play/pause loop pushing frames), protocol, promise-based `SimClient` with `onFrame`
  - `config.ts` — `SimConfig`, defaults, zod `SimConfigSchema`
- **`render/`** — React Three Fiber night diorama (decision 0005, [UI spec](superpowers/specs/2026-10-09-genusloci-ui-design.md)):
  - pure, tested prep: `layout.ts` (cells, landmark pads, procedural buildings that avoid roads, water, parks and pads), `palette.ts` (scene hues by lineage), `venues.ts` (per-slot landmark views), `geometry.ts` (street ribbons, polygons)
  - scene: `CityCanvas` (camera, MapControls, bloom and vignette), `Ground`, `Streets`, `Buildings` (instanced, window-light shader), `Landmarks` (per venue kind, neon sign = dominant scene, health = brightness), `Crowd` (instanced agents eased between ticks)
- **`app/api/world/[slug]`** — serves a built World (404 if unknown or not built). Hosting the files on Vercel is an M7 task.
- **`ui/`** — `useCityWorld` (Qloo world first, then synthetic over OSM, then Synthville), `useSimulation` (worker lifecycle, pushed frames in a ref plus state, actions, rewind), `GameShell` (composition and tools), `Hud`, `Toolbar`, `TimelineBar`, `VenuePanel`; `ClientGame` loads it client-only (`next/dynamic` with `ssr: false`)
- **`agents/`** — LLM features on the Vercel AI SDK v7 (decision 0003):
  - `providers.ts` — provider chain (DeepSeek → Groq → Cerebras → OpenRouter → Gemini; only those with keys), `fallbackModel` (next provider if a call fails before streaming), `modelFor(tier)`; DeepSeek thinking is off
  - `tools.ts` — co-pilot tool and action schemas shared by server and browser (`city_summary`, `find`, `venues`, `venue`, `scene`, `what_if`, `apply`)
  - `city.ts` — the co-pilot's view of the city, computed in the browser from World + frame + digest: summaries, fuzzy find, venue ranking, area resolution, action mapping, named what-if results, interview personas
  - `run-tool.ts` — runs city tools in the browser against the worker; never throws
  - `copilot.ts` — instructions, server-side Qloo tools (`qloo_search`, `qloo_taste`, capped per question, budget floor ≥ 1000), `copilotStream`
  - `naming.ts` — plain scene names from Qloo tastes (structured output, small tier)
  - `interview.ts` — persona schema and grounded first-person chat
  - `rate-limit.ts` — per-visitor token bucket
- **`app/api/copilot`, `app/api/name-scenes`, `app/api/interview`** — the LLM routes (503 without a key; 429 when rate-limited). City tools run in the browser via `useChat` `onToolCall`; Qloo tools run on the server.
- **`sim/whatif.ts`, `sim/resident.ts`** — scenario versus baseline comparison (4 paired seeded runs; mean, range and consistency per effect; Scout uses the same pairing with 3 runs) and resident profiles, exposed as worker commands `whatIf` and `resident`.

## Qloo access

- Hackathon API server: `https://hackathon.api.qloo.com` (hackathon keys only work there). Authenticate with the `X-Api-Key` header.
- Key: `QLOO_API_KEY` in `.env.local` (git-ignored; never commit it or paste it into docs or chat).
- Limits: 5 requests per second and **10,000 per month**. Cache everything.
- Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide

## Boundaries

- Qloo response data must **never** be committed to the repo (Qloo terms). Fixtures in the repo are synthetic.
- Secrets live in environment variables only: `QLOO_API_KEY`, `DEEPSEEK_API_KEY`, and optional fallbacks `GROQ_API_KEY`, `CEREBRAS_API_KEY`, `OPENROUTER_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY` (models overridable with `<PROVIDER>_MODEL` / `<PROVIDER>_SMALL_MODEL`).
- The co-pilot only changes the live city through `apply`, which it is told to use only when the user asks.
- Sim ticks make zero API calls; the server is stateless apart from caches.

## Commands (verified 2026-10-09)

- `pnpm install` — install dependencies
- `pnpm dev` — run the Next.js dev server; the game is at `/` (browser preview config: `.claude/launch.json` → `web`)
- `pnpm build` — production build (Next.js 16)
- `pnpm lint` — ESLint
- `pnpm test` — run all unit tests (Vitest; config in `vitest.config.mts`)
- `pnpm test:watch` — watch mode
- `pnpm bench:sim` — simulation tick-rate benchmark (target ≥ 10 ticks/sec at 5,000 agents)
- `pnpm calibrate` — baseline fidelity and ecology report on the synthetic fixture (`--london` for synthetic London, `--world=<city>` for a built Qloo world)
- `pnpm build:world <city>` — build a city's Qloo World into `.cache/worlds` (about 55–80 Qloo calls the first time; reruns are free from the file cache)
- `pnpm qloo:smoke [city]` — a few live Qloo calls through the file cache (reruns are free); prints counts and the remaining monthly quota, never response data
- `pnpm build:geo <city>` — fetch a city's roads, water and parks from Overpass into `public/geo/<city>.json` (one request per run; don't loop)
