# Current State

<!-- generated: maintained by agents -->

**Phase:** Plan 1 complete (scaffold + sim core), merged to `main`. Next: Plan 2 (sim ecology).

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

## Next
1. Request the Qloo hackathon API key if not already done (issued manually; takes days).
2. Write and execute Plan 2 (sim ecology). Plan 3 (Qloo spike) as soon as the key arrives. See `docs/superpowers/plans/2026-10-09-roadmap.md`.

## Carry into Plan 2 (from the final Plan 1 review)
- **Venue tables live in the shared `CompiledWorld`.** `openVenue` needs per-state venue tables (or pre-allocated reserve slots), cloned and hashed. Decide this first; it is the biggest API change.
- **Fixed agent count.** Migration needs spare capacity plus an `alive` mask; steps must skip dead slots. Keep slot indexes stable for scene lineage.
- **`step(s)` → `step(s, actions?)`.** Tick-stamped actions are applied before outing and logged for replay and rewind.
- **New mutable state** (events, rent modifiers, action log, and homeCell/energy/friends once actions change them) must go into `cloneState` and `hashState`. Add a test asserting the clone shares no typed array except `cw`.
- **Exposure mutates genomes in place**, which gives a small bias by agent order. Snapshot co-attendee top genes before the loop.
- **Store `maxNearby` on `CompiledWorld`** and size the outing candidate buffer from it.
- **Scene clustering cost.** Use sampled k-medoids every K ticks, never all-pairs.
- **Calibration and tuning.** On the benchmark world no venue closes naturally in 300 ticks, while genomes saturate toward the 32-gene cap. Tune toward realistic closure rates and watch genome saturation.
- **Worker host.** Keep the state inside the worker, post digests only (the state references the whole World), and call `parseWorld` before `initState`.
- **Determinism** is guaranteed within one JS engine only (`Math.exp`/`Math.cos`). Document this for share links.

## Open questions / risks
- Qloo rate limits are unknown; heatmap and audience coverage are unverified.
- The server cache choice (Vercel Blob vs KV) is undecided.
- See spec §14.
