# Current State

<!-- generated: maintained by agents -->

**Phase:** Plan 2 complete (sim ecology), merged to `main`. Next: Plan 3 (Qloo spike) once the key arrives; Plan 5 (UI) can start on the fixture meanwhile.

## Done
- Concept, name (**Genus Loci**), design spec, roadmap. Repo: https://github.com/jephoton/genusloci-culture-simulator (public, MIT).
- **Plan 1:**
  - Next.js 16 scaffold; Vitest/zod/tsx tooling.
  - World schema and a synthetic fixture.
  - Seeded RNG; compiled world index (CSR edges, venue profiles).
  - Sparse genomes; agent init (density placement, archetype genomes, friends).
  - Tick loop: outing → attendance → exposure/adoption → drift → decay → venue lifecycle.
  - Determinism hash.
  - 58 tests passing; tsc and lint clean.
  - **Benchmark:** 5,000 agents / 1,000 entities / 80 venues / 400 cells: init ≈ 100 ms, **≈ 144 ticks/sec** (target 10).

- **Plan 2:**
  - Actions: close/open venue, event, migrate, rent pressure.
  - Scenes with lineages.
  - Niche auto-opening.
  - Heatmap fidelity metric.
  - Digest.
  - Timeline with exact rewind and fork.
  - Worker host + client, with hardening: zod config, unknown commands, error path.
  - 130 tests passing; tsc and lint clean.
  - **Benchmark:** ≈ 64–84 ticks/sec at 5,000 agents (varies with machine load; clustering runs every 4th tick).
  - `pnpm calibrate` (synthetic): fidelity 0.990 → 0.984 over 100 ticks; venues 24 → 27 (auto-open); 6 stable scenes.

## Next
1. Request the Qloo hackathon API key if not already done (issued manually; takes days).
2. Plan 3 (Qloo spike + client) as soon as the key arrives.
3. Plan 5 (UI) can start on the synthetic fixture in parallel. See `docs/superpowers/plans/2026-10-09-roadmap.md`.

## Carry forward (from the Plan 2 final review)
- **Plan 5 must start with these:**
  - **Non-blocking runs.** `run` currently blocks the worker (520 ticks ≈ 8 s). Use chunked play/pause with progress.
  - **Render frames.** Add a `frame` response with transferable typed arrays: alive, homeCell (on change), attendance, `live[assignment[i]]` scene lineage, venue open/health/attendance/cell/entity/expires sliced to `nVenues`, and tick. Send the digest on a slower cadence (fidelity costs ≈ 6 ms).
  - **Verify worker bundling.** Check `new Worker(new URL(...))` under Next 16.
- **Timeline snapshots.** Eviction keeps tick 0 and drops the next oldest, so old rewinds get slow (≈ 1–4 s). Use thinned retention, e.g. every 10 recent, 40 older, 160 oldest.
- **Memory.** About 2.5 MB per snapshot, ≈ 78 MB per timeline at bench scale. `venueProfile` depends only on the entity: precompute per place in `cw` and drop it from the state. Cap live forks at about 3.
- **Ecology is too static on the fixture.**
  - No natural closures and no splits.
  - Tune venues on real worlds, e.g. `closeThreshold` relative to median health, capacity from the outing rate.
  - Add bisecting splits of dispersed scenes, venues drifting toward their crowd, rent-driven residential moves, and a small agent turnover using the `alive` mask.
  - Add bridge entities to the fixture.
- **Auto-open quirks.** It ignores `entity.capacity`, can duplicate an already-open entity, and counts supply city-wide rather than near the niche.
- **Venue slots.** Closed permanent venue slots are never reused, so `venueReserve` can run out under heavy churn.
- **Protocol for the co-pilot (Plan 6).**
  - Results:
    - `act` says "queued" but the action can still fail when applied, so return tokens.
    - `Timeline.queue` stores caller objects by reference, so clone them.
  - Commands to add:
    - `venues` (per-venue state), `niches` (enables `openVenue` from a niche) and `inspect` (agent genome for personas).
    - `compare` (digest diff) and a dry-run `validate`.
- **World builder (Plan 4).** Places need `cell` + `capacity`. Expose a Qloo-id → index map. Keep `nEntities` ≤ ~2,000 (`venueProfile` and centroids are dense).
- **Known, accepted.**
  - Adoption reads friends' genomes mid-tick.
  - Existing agents don't befriend migrants.
  - `mergedInto` can point at a lineage born the same tick.
  - Determinism holds within one JS engine only.

## Open questions / risks
- Qloo rate limits are unknown; heatmap and audience coverage are unverified.
- The server cache choice (Vercel Blob vs KV) is undecided.
- See spec §14.
