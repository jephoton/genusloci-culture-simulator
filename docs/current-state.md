# Current State

<!-- generated: maintained by agents -->

**Phase:** Plan 5a complete (playable city). Next: Plan 5b (juice + field guide); Plan 3 (Qloo spike) as soon as the key arrives.

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
- **Plan 5a (playable city):**
  - Worker play/pause streaming transferable frames, with `stopped` notices.
  - Age-thinned snapshots.
  - World `geo` + venue `kind`, synthetic streets, river and parks.
  - City layout: procedural buildings sized to the street grain, and landmark pads clear of roads, water and buildings. Each pad carries its own landmark scale (`padScale`, 1.0–2.2): Synthville keeps 2.2 everywhere, and on London about 92% of pads fit at ≥ 1.0 (the rest are `crampedPads`, mostly in park or river cells).
  - Three.js night diorama: bloom, window-light shader, neon landmarks per kind, crowds coloured by scene.
  - Toolbar (open venue, throw event), venue panel (close), timeline (play, speed, rewind), HUD.
  - Verified in the browser: everything works, no console errors.
  - 167 tests passing; tsc, lint and build clean.

## Next
1. Request the Qloo hackathon API key if not already done (issued manually; takes days).
2. Plan 5b (juice + field guide): effects director (shockwave/fisheye, rise/sink, beacons, colour waves), specimen cards, phylogeny, Latin names, remaining tools.
3. Plan 3 (Qloo spike + client) as soon as the key arrives.

## Carry into Plan 5b (from the Plan 5a final review)
- **Frame sequencing:** add `seq` and `epoch` to `Frame`. Bump `epoch` on init and rewind, and mark `refresh` frames as jumps, so the effects director only diffs consecutive frames of the same epoch.
- **Per-frame change list:** venue opened/closed/expired, event started, scene born/split/merged/died, action results. Today scene events arrive only via the digest (every 4th tick, capped at 10).
- **New commands:**
  - `lineages`: full lineage table (bornTick, diedTick, mergedInto, peakSize, topEntities) for the phylogeny.
  - `inspect`: one agent, venue or scene, for specimen cards.
  - Cell or neighbourhood names in the World, for Latin epithets.
- **Effect anchors:** landmark position and radius lookup (`LANDMARK_RADIUS` × `VenueView.scale`, the pad's scale), plus a camera-shake hook.
- **Do per-frame work once:** `venueViews`, `sceneHues` and home positions are each computed twice per frame (Landmarks + Crowd). Compute them once in `accept`; `React.memo` the panels.
- **Action results:** play-loop and `run` results are discarded. A double "Close venue" while playing queues twice.
- **Rewind:** clear the selected venue (`VenuePanel` can show a reused slot).
- **Visuals:** the building shader ignores fog. The selection ring is fixed in landmark units, so it can spill past the pad's clearance (music venue). The event pillar is too thin to notice.
- **Accessibility:**
  - `aria-label`s on the asides, header and footer; `role="status"` on the loading text; `aria-valuetext` on the slider.
  - Focus the panel on open.
  - Keyboard path for selecting and placing (venue list or cell picker).
- **Layout performance:** `buildLayout` takes ≈ 0.3 s on Synthville and ≈ 0.8 s on London, on the main thread. Consider a worker or precomputing per world.

## Carry forward (from the Plan 2 final review)
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
