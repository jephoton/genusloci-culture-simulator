# Current State

<!-- generated: maintained by agents -->

**Phase:** M4a complete (real London streets from OpenStreetMap). Next: M5b (juice + field guide); M3 (Qloo spike) as soon as the key arrives.

## Done
- Concept, name (**Genus Loci**), design spec, roadmap. Repo: https://github.com/jephoton/genusloci-culture-simulator (public, MIT).
- **M1:**
  - Next.js 16 scaffold; Vitest/zod/tsx tooling.
  - World schema and a synthetic fixture.
  - Seeded RNG; compiled world index (CSR edges, venue profiles).
  - Sparse genomes; agent init (density placement, archetype genomes, friends).
  - Tick loop: outing → attendance → exposure/adoption → drift → decay → venue lifecycle.
  - Determinism hash.
  - 58 tests passing; tsc and lint clean.
  - **Benchmark:** 5,000 agents / 1,000 entities / 80 venues / 400 cells: init ≈ 100 ms, **≈ 144 ticks/sec** (target 10).

- **M2:**
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
- **M5a (playable city):**
  - Worker play/pause streaming transferable frames, with `stopped` notices.
  - Age-thinned snapshots.
  - World `geo` + venue `kind`, synthetic streets, river and parks.
  - City layout: procedural buildings sized to the street grain, and landmark pads clear of roads, water and buildings. Each pad carries its own landmark scale (`padScale`, 1.0–2.2): Synthville keeps 2.2 everywhere, and on London about 92% of pads fit at ≥ 1.0 (the rest are `crampedPads`, mostly in park or river cells).
  - Three.js night diorama: bloom, window-light shader, neon landmarks per kind, crowds coloured by scene.
  - Toolbar (open venue, throw event), venue panel (close), timeline (play, speed, rewind), HUD.
  - Verified in the browser: everything works, no console errors.
  - 167 tests passing; tsc, lint and build clean.
- **M4a (real streets):**
  - OSM Overpass pipeline (`pnpm build:geo`), `public/geo/london.json` (14,217 roads, 51 water, 1,453 parks, ≈ 1 MB, ODbL).
  - Synthetic population over real geography: density from street length, neighbourhood-clustered scenes.
  - The game loads London, with a fallback to Synthville and OSM attribution.
  - Layout retuned for real street grain:
    - London `buildLayout` ≈ 0.86 s (was 6.3 s), 3,682 buildings;
    - adaptive per-pad landmark scale, with 91% of pads fitting at ≥ 1.0 and 68 cramped pads, mostly in parks and by the Thames.
  - Verified in the browser: recognisable London, simulation runs, no console errors.
  - 189 tests passing.

## Queued (user feedback 2026-10-10; do these next)
1. ~~Speed~~: done. ⅛, ¼, ½ and 1 wk/s; 1 is the maximum.
2. ~~Start-up signal~~: done. Scene hotspot auras (cells where a scene is over-represented), gentle waves for automatic openings (full shockwave only for the player), red pulse plus toast for struggling venues.
3. ~~Promoter flow~~: done. **Scout a location** (M5c):
   - demand glow, candidates A–C plus your own D, forked 4-week what-ifs with a no-event baseline, compare panel, Book it;
   - scouted nights reach 1.5 km (`SCOUT_DEFAULTS`), because at 25 km every spot drew the same crowd;
   - about 0.1–0.15 s per comparison on London.
   - Still to do:
     - **Book for my venue.**
     - **Noisy neighbour-loss metric.** Each fork diverges randomly from the baseline. Use common random numbers or average over a few seeds.
     - **Closures don't explain *why*.**
     - **Scenes stop moving after about week 4.**
4. ~~Daily ticks and true pause~~: done (M5d).
   - **Daily simulation:** `ticksPerWeek`, default 1, so weekly mode is identical, as the unchanged tests prove; the demo uses 7.
     - Weekly rates convert per tick. Outings use a share (`rate / ticksPerWeek`) so weekly visit totals stay equal.
     - Weekday weights favour Friday and Saturday. Venue health uses a rolling 7-day visit sum.
   - **Pausable clock** (`SimClock` on `FrameStore`): pause freezes walkers, waves and pulses mid-motion.
   - **Day-based UI:** HUD "Week W · Fri"; speeds ½, 1, 2 and 4 day/s, default 1.
   - **Venue identity colour:** the body and roof band use the venue's own scene (`frame.venueScene`); the sign shows tonight's crowd.
   - **About 1.2 ms per daily tick** on London.
   - **Watch:**
     - at 1 day/s a night out lasts 1 s, possibly too fast, and ½ is available;
     - actions taken while paused only play out on resume;
     - signs can flicker on quiet days;
     - landmarks mounted while paused appear without rising.
5. **5b-2:** name scenes from their dominant Qloo tags (plus a mock-Latin binomial) so scenes are self-explanatory.

## M3 (Qloo spike + client): done (2026-10-14)
- Spike findings are in [qloo-notes.md](qloo-notes.md):
  - limits of 5 requests per second and **10,000 per month**;
  - a 429 doesn't count against the quota;
  - places include coordinates and about 100 tags each;
  - heatmaps use 7-character geohash cells;
  - some venues aren't accepted as signals for artists or tags.
- `src/qloo/` is a typed client with validation, throttling, retries, a quota floor, a file cache (including cached 400s) and response trimming. It has 31 unit tests using synthetic payloads.
- `pnpm qloo:smoke [city]` passes live for London and Singapore. About 9,940 monthly calls remain.
- **To do by hand:** add `.env.example`; the agent isn't permitted to write `.env*` files. The suggested content is in the M3 milestone doc.

## Next
1. **M4 (World builder)**: real Qloo venues, tastes and heatmaps for London and Singapore, built on `src/qloo`.
2. M6 (agents) and M7 (ship).
3. Fit in when there's a gap: **M5e (Book for my venue)** and M5b-2 (field guide).

## Carry into M5b (from M4a)
- **Layout on the main thread:** ≈ 0.8 s on London. Move it to a worker or precompute it per city.
- **Building shapes:** dense London buildings are small footprints with the unchanged height range, so they can look spiky. Tune the height distribution by footprint.
- **Placeholder names:** venues are still "Cluster N Venue M" until Qloo data (M4) or Latin naming (5b).
- **Synthville density:** now ≈ 8.7k buildings (edge buildings shrink to fit). Make the candidate count depend on the city's area if it looks too dense.

## Carry into M5b (from the M5a final review)
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

## Carry forward (from the M2 final review)
- **Timeline snapshots.** Eviction keeps tick 0 and drops the next oldest, so old rewinds get slow (≈ 1–4 s). Use thinned retention, e.g. every 10 recent, 40 older, 160 oldest.
- **Memory.** About 2.5 MB per snapshot, ≈ 78 MB per timeline at bench scale. `venueProfile` depends only on the entity: precompute per place in `cw` and drop it from the state. Cap live forks at about 3.
- **Ecology is too static on the fixture.**
  - No splits. Scene membership barely changes after the first clustering (London: identical hotspots at weeks 10, 50 and 100), so turnover settles after about 30 weeks, and closures read as "weakest of several same-scene venues in one neighbourhood" rather than "a scene moved away".
  - Tune venues on real worlds, e.g. `closeThreshold` relative to median health, capacity from the outing rate.
  - Add bisecting splits of dispersed scenes, venues drifting toward their crowd, rent-driven residential moves, and a small agent turnover using the `alive` mask.
  - Add bridge entities to the fixture.
- **Auto-open quirks.** It can duplicate an already-open entity, and counts supply city-wide rather than near the niche.
- **Venue slots.** Closed permanent venue slots are never reused, so `venueReserve` can run out under heavy churn.
- **Protocol for the co-pilot (M6).**
  - Results:
    - `act` says "queued" but the action can still fail when applied, so return tokens.
    - `Timeline.queue` stores caller objects by reference, so clone them.
  - Commands to add:
    - `venues` (per-venue state), `niches` (enables `openVenue` from a niche) and `inspect` (agent genome for personas).
    - `compare` (digest diff) and a dry-run `validate`.
- **World builder (M4).** Places need `cell` + `capacity`. Expose a Qloo-id → index map. Keep `nEntities` ≤ ~2,000 (`venueProfile` and centroids are dense).
- **Known, accepted.**
  - Adoption reads friends' genomes mid-tick.
  - Existing agents don't befriend migrants.
  - `mergedInto` can point at a lineage born the same tick.
  - Determinism holds within one JS engine only.

## Open questions / risks
- Qloo rate limits are unknown; heatmap and audience coverage are unverified.
- The server cache choice (Vercel Blob vs KV) is undecided.
- See spec §14.
