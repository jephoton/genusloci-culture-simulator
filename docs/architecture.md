# Architecture — Genus Loci

<!-- generated: maintained by agents; keep in sync with the spec -->

**Goal:** a god-game sandbox of a real city's cultural ecosystem, grounded in Qloo's taste graph, built for the Qloo Agentic Hackathon (deadline 2026-10-31 11:45 GMT+8).

**Full design:** [superpowers/specs/2026-10-09-genusloci-design.md](superpowers/specs/2026-10-09-genusloci-design.md)

## Components

- **`qloo/`** — server-side Qloo client (`https://hackathon.api.qloo.com`, `X-Api-Key`). Validates, caches, throttles.
- **`world/`** — builds a per-city World file (entities, affinity edges, heatmaps, archetypes). Cached server-side only.
- **`sim/`** — pure, deterministic TypeScript engine (no network, no DOM), hosted in a Web Worker:
  - `state.ts` + `venue-table.ts` — agent slots with an `alive` mask; per-state venue table; expired event slots are reused (decision 0004)
  - `steps/` — outing → attendance → exposure/adoption → drift → decay → venue lifecycle (events, rent)
  - `actions/` — zod action schema shared by the toolbar and the co-pilot; `applyAction` (close/open venue, event, migrate, rent pressure)
  - `scenes/` — warm-started spherical k-means scenes + lineage tracking (birth/split/merge/extinction)
  - `niches.ts` — unmet-demand niches; auto-opens matching real places
  - `calibration.ts` — Spearman fidelity against Qloo heatmaps
  - `digest.ts` — compact serialisable summary for the UI and co-pilot
  - `timeline.ts` — snapshots, exact rewind (snapshot + action-log replay), fork
  - `worker/` — Web Worker host (zod-validated config and actions), protocol, promise-based `SimClient`
  - `config.ts` — `SimConfig`, defaults, zod `SimConfigSchema`
- **`agents/`** — LLM co-pilot (tool use, provider-agnostic via Vercel AI SDK; DeepSeek primary), persona interviews, scene naming.
- **`ui/`** — Next.js app: deck.gl/MapLibre map, phylogeny, inspector, chat.

## Boundaries

- Qloo response data must **never** be committed to the repo (Qloo terms). Fixtures in the repo are synthetic.
- Secrets live in environment variables only (`QLOO_API_KEY`, `DEEPSEEK_API_KEY`, fallback provider keys).
- Sim ticks make zero API calls; the server is stateless apart from caches.

## Commands (verified 2026-10-09)

- `pnpm install` — install dependencies
- `pnpm dev` — run the Next.js dev server
- `pnpm build` — production build (Next.js 16)
- `pnpm lint` — ESLint
- `pnpm test` — run all unit tests (Vitest; config in `vitest.config.mts`)
- `pnpm test:watch` — watch mode
- `pnpm bench:sim` — simulation tick-rate benchmark (target ≥ 10 ticks/sec at 5,000 agents)
- `pnpm calibrate` — baseline fidelity and ecology report on the synthetic fixture
