# Architecture — Genus Loci

<!-- generated: maintained by agents; keep in sync with the spec -->

Current rendering/playback policy: `CityCanvas` omits placeholder background buildings while retaining actual venue landmarks, roads and labels. Applied cases are armed paused through worker `startCase.autoplay=false`; the bottom Play button starts observation and Pause retains it. Chat playback/exit requests produce button guidance rather than calling controls. Case endpoint stopping and operational pauses for inspection/application/rewind remain. See the current walkthrough.

## Simulation scheduling and world builds

The visible interface now uses live applied cases and named change checkpoints instead of numbered weeks. `sim/case.ts` monitors bounded actual playback in the worker, preserving pause/resume/speed and emitting one completion report. `useSimulation` delays automatic completion presentation until the final crowd outing has animated, then pauses and publishes observed outcomes. `GameShell` preserves a relevant-only experiment focus during inspection; `LabChat` releases it explicitly through finish/resume. Bottom playback and `TimelineBar` expose session-local change history and snapshot rewind. Internal cycle cadence, scheduling and legacy tool units remain engine details. See [decision 0008](decisions/0008-live-cases-and-change-history.md).

Valid replacement interventions now finish the previous monitor before refreshing/revalidating context; applied changes remain in the city. Exit case/view also releases focus and pauses. `attendanceHistory` stores one rolling activity cycle per resident in snapshot-safe typed arrays; tally writes it, resident replacement/event slot recycling clears stale attribution, and frames expose independent copies for recent-visitor highlighting. Raw expired-event attendance is preserved for final-turnout accounting, while render frames filter invalid reused lifetimes. Venue/body beacon colours use the closest live taste scene, not a fixed case colour.

The deferred-features batch adds simulation closure evidence (`sim/closures.ts`), snapshot-safe event scheduling (`sim/scheduling.ts`, action schema, worker, booking previews), and optional seeded residential movement/turnover (`sim/steps/ecology.ts`, clustering, config). General ecology defaults remain disabled; the demo enables turnover and the split check, while residential moves remain off after real-city fidelity measurements. Closure evidence and event labels/calendar metadata travel in frames; recent transmitted history is bounded while state retains history. Booking forecasts preserve calendar insertion order and count attendance by candidate lifetime, including final attendance when its venue slot is reused.

The operator-authenticated `/api/world-builds` route uses a private Blob compare-and-swap ledger, fenced global lease, cached stage replay and per-call budget debit. Existing world loading prefers a successfully committed build output. It supports registry cities only. `WORLD_BUILD_TOKEN` authorizes operators; `WORLD_BUILD_QUOTA_REMAINING` initializes a conservative shared quota estimate; the reserve is at least 1,000 calls. Monthly quota reconciliation uses authenticated PATCH, and `/build-city` provides operator controls that retain a job's fixed call budget across reloads. See [operator instructions](on-demand-world-builds.md). Production build controls remain disabled until configured.

Transient planning and naming state is tied to simulation timeline identity. Planning closes if its tick, epoch or host changes, and callbacks guard against stale comparisons. Naming prunes discarded lineages and rejects results from abandoned generations. Outside-artist HTTP responses contain stable Qloo IDs; `ui/outside-act-client.ts` matches those IDs to the caller's actual World, avoiding numeric-index mismatches after world publication.

**Goal:** a chat-first cultural ecology laboratory for learners and portfolio exploration, grounded in Qloo's taste graph. Visitors inspect the authored model, compare interventions and distinguish model behavior from real-world forecasts. The engine retains the original ecosystem mechanisms; a professional event-planning product is not validated. See [current chat walkthrough](chat-lab-walkthrough.md) and [product spikes](spikes/README.md).

**Current interaction boundary:** `LabChat` routes known commands through `agents/offline-chat.ts` and canonical `runCityTool`; deterministic evidence formatting is separate from interpretation. Optional LLM assistance supports inspection/comparisons and receives recent local evidence, but live actions remain explicit local commands. `useCopilot` retains cooldown/deduplication; local commands need no inference. Background naming is disabled. Former workspace components remain hidden compatibility code, not additional visible entry points.

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
- **`app/api/world/[slug]`** — serves a built World via `world/store.ts`: `.cache/worlds` locally, else the **private** Vercel Blob store (`worlds/<slug>.world.json`, read with `BLOB_READ_WRITE_TOKEN`); 404 if unknown or not built.
- **`ui/`** — `useCityWorld` (Qloo world first, then synthetic over OSM, then Synthville), `useSimulation` (worker lifecycle, pushed frames in a ref plus state, actions, rewind), `GameShell` (composition and tools), `Hud`, `Toolbar`, `TimelineBar`, `VenuePanel`; `ClientGame` loads it client-only (`next/dynamic` with `ssr: false`)
- **`agents/`** — LLM features on the Vercel AI SDK v7 (decision 0003):
  - `providers.ts` — configured chat chain Gemini Flash-Lite → Groq; `fallbackModel` advances on failures/empty streams before text/tool activity. Other vendors remain registered for explicit probes only. `LabChat` falls back to the bounded deterministic parser after AI failure, or immediately when AI is disabled/cooling down.
  - `tools.ts` — co-pilot tool and action schemas shared by server and browser (`city_summary`, `find`, `venues`, `venue`, `scene`, `what_if`, `apply`)
  - `city.ts` — the co-pilot's view of the city, computed in the browser from World + frame + digest: summaries, fuzzy find, venue ranking, area resolution, action mapping, named what-if results, interview personas
  - `run-tool.ts` — runs city tools in the browser against the worker; successful what-if calls capture a shared resolved-action record for one explicit local apply. Epoch/timeline/venue-identity guards prevent stale replay; only accepted actions trigger playback/focus callbacks.
  - `copilot.ts` — instructions, server-side Qloo tools (`qloo_search`, `qloo_taste`, capped per question, budget floor ≥ 1000), `copilotStream`
  - `naming.ts` — plain scene names from Qloo tastes (structured output, small tier)
  - `interview.ts` — persona schema and grounded first-person chat
  - `rate-limit.ts` — per-visitor token bucket
- **`app/api/copilot`, `app/api/name-scenes`, `app/api/interview`** — the LLM routes (503 without a key; 429 when rate-limited). City tools run in the browser via `useChat` `onToolCall`; Qloo tools run on the server.
- **`sim/events.ts`, `sim/booking.ts`** — the shared paired-run engine for candidate events (Scout: one act, several spots; booking: one venue, several acts, including the host venue's own change). Events may carry a taste `profile` (outside artists).
- **`app/api/outside-act` + `agents/outside-act.ts` + `ui/outside-act-client.ts`** — live Qloo: search an artist and return similar artists and tag affinities with stable IDs; the browser matches them to its own World to build an event profile.
- **`sim/whatif.ts`, `sim/resident.ts`** — scenario versus baseline comparison (4 paired seeded runs; mean, range and consistency per effect; Scout uses the same pairing with 3 runs) and resident profiles, exposed as worker commands `whatIf` and `resident`.

## Qloo access

- Hackathon API server: `https://hackathon.api.qloo.com` (hackathon keys only work there). Authenticate with the `X-Api-Key` header.
- Key: `QLOO_API_KEY` in `.env.local` (git-ignored; never commit it or paste it into docs or chat).
- Limits: 5 requests per second and **10,000 per month**. Cache everything.
- Docs: https://docs.qloo.com/reference/qloo-llm-hackathon-developer-guide

## Boundaries

- Qloo response data must **never** be committed to the repo (Qloo terms). Fixtures in the repo are synthetic.
- Secrets live in environment variables only: `QLOO_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `GROQ_API_KEY` (models overridable with `<PROVIDER>_MODEL` / `<PROVIDER>_SMALL_MODEL`). Other registered provider keys are for explicit probes, not automatic chat fallback.
- The AI guide has no advertised live `apply` tool. Explicit local live commands invoke the validated dispatcher; provider retries cannot replay these writes. Questions use AI first, with deterministic interpretation after exhaustion.
- Sim ticks make zero API calls; the server is stateless apart from caches.

## Deployment (M7)

- **Vercel project** `genusloci-culture-simulator`, connected to the GitHub repo: pushes to `main` deploy production. Live at https://genusloci-culture-simulator.vercel.app. `vercel.json` pins the Next.js preset.
- **Environment variables** (encrypted, production and preview): `QLOO_API_KEY`, `DEEPSEEK_API_KEY`, `QLOO_CACHE_DIR=/tmp/qloo`, and `BLOB_READ_WRITE_TOKEN` from the connected private Blob store `genusloci-worlds`.
- **Worlds:** run `pnpm build:world <city>` locally, then `pnpm upload:worlds`. They are uploaded with private access, so anonymous URLs return 403. Upload again after a rebuild; no redeploy is needed, but serverless instances memoise worlds until they recycle.
- `.vercelignore` keeps `.cache/`, `data/` and env files out of CLI deploys.
- **Caution:** `vercel link`, `vercel env pull` and `vercel blob create-store` rewrite `.env.local` from Vercel's *development* environment, which drops variables that exist only locally. Keep a copy of local keys, and revert their `.gitignore` edits, which re-add `.env*` after the `!.env.example` exception.

## Commands (verified 2026-10-09)

- `pnpm install` — install dependencies
- `pnpm dev` — run the Next.js dev server; the game is at `/` (browser preview config: `.claude/launch.json` → `web`)
- `pnpm build` — production build (Next.js 16)
- `pnpm lint` — ESLint
- `pnpm test` — run all unit tests (Vitest; config in `vitest.config.mts`)
- `pnpm test:watch` — watch mode
- `pnpm bench:sim` — simulation tick-rate benchmark (target ≥ 10 ticks/sec at 5,000 agents)
- `pnpm calibrate` — baseline fidelity and ecology report on the synthetic fixture (`--london` for synthetic London, `--world=<city>` for a built Qloo world)
- `pnpm upload:worlds [city…]` — upload built worlds to the private Blob store (needs `BLOB_READ_WRITE_TOKEN`)
- `pnpm build:world <city>` — build a city's Qloo World into `.cache/worlds` (about 55–80 Qloo calls the first time; reruns are free from the file cache)
- `pnpm qloo:smoke [city]` — a few live Qloo calls through the file cache (reruns are free); prints counts and the remaining monthly quota, never response data
- `pnpm build:geo <city>` — fetch a city's roads, water and parks from Overpass into `public/geo/<city>.json` (one request per run; don't loop)
