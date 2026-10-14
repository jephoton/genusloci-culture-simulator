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
     - ~~Noisy neighbour-loss metric~~: done. Scout now averages 3 paired seeded runs.
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
5. **5b-2:** name scenes from their dominant Qloo tags so scenes are self-explanatory (done in M6; no Latin names, by user preference).

## M3 (Qloo spike + client): done (2026-10-14)
- Spike findings are in [qloo-notes.md](qloo-notes.md):
  - limits of 5 requests per second and **10,000 per month**;
  - a 429 doesn't count against the quota;
  - places include coordinates and about 100 tags each;
  - heatmaps use 7-character geohash cells;
  - some venues aren't accepted as signals for artists or tags.
- `src/qloo/` is a typed client with validation, throttling, retries, a quota floor, a file cache (including cached 400s) and response trimming. It has 31 unit tests using synthetic payloads.
- `pnpm qloo:smoke [city]` passes live for London and Singapore. About 9,940 monthly calls remain.
- `.env.example` lists the environment variables.

## M4 (World builder): done (2026-10-14)
- **London and Singapore run on real Qloo data:**
  - London: 140 venues plus 60 reserve, 180 tags, 200 artists, 8 scenes;
  - Singapore: 130 venues plus 30 reserve.
- `pnpm build:world <city>` writes `.cache/worlds/<city>.world.json` (git-ignored). `/api/world/[slug]` serves it, and the game loads it first, falling back to the synthetic city.
- The attribution now credits "Taste data: Qloo".
- **Fidelity is held out:** one heatmap per scene seeds residents, and a different one is scored. London scores 0.17 → 0.20 and Singapore 0.04 → 0.12 over 60 weeks.
- Equilibrated capacities give gradual venue turnover. A niche-loop bug in the sim is fixed.
- Verified in the browser:
  - real venue names and kinds;
  - scenes listing real tags and artists;
  - the event picker offers real artists by scene;
  - the city switcher works;
  - no console errors.
- 342 tests passing. About 9,720 Qloo calls remain this month.
- **Rough edges:**
  - World files are about 1.4–1.6 MB, mostly 17–20k edges.
  - Scene names are placeholders until 5b-2; tags such as "Functional" or "Casual" are vague.
  - Galleries and theatres dominate London's venue mix.
  - The HUD's events count lags by up to 4 days, because it comes from the digest (every 4th frame).
  - Fidelity is modest. Present it honestly.
  - Hosting the World files on Vercel is not solved (M7).

## M6 (agents): done (2026-10-14)
- **Co-pilot** (left panel, "Ask the co-pilot"):
  - DeepSeek V4 Flash through the AI SDK v7, with a fallback chain;
  - city tools run in the browser against the worker: summary, find, venue ranking, venue, scene, **what-if against a baseline**, apply;
  - Qloo search and taste tools run on the server, capped per question;
  - verified live: "what if the busiest club closes" gave a grounded, honest answer with real venue names and visit shifts; "close Heaven" changed the live city and flew the camera there.
- **Scene names:** each new scene gets a short plain name, e.g. "Historic theatre crowd". (Mock-Latin binomials were tried and dropped as corny.) They are used in the legend, toasts, headliner groups and scout results.
- **Interviews:** "Talk" on a legend row interviews a typical member of that scene; "Meet someone else" picks the next most typical. Verified live.
- **Neighbourhood names** from Qloo for venues and cells.
- **Tests and checks:** 381 tests passing; lint and build clean.
- **Rough edges:**
  - Answers take about 10–30 s, because each browser tool call is a round trip.
  - ~~Single-run what-ifs~~: done. Each what-if runs 4 paired seeded comparisons and reports mean, range and whether every run agreed ("clear" or "too small to call"). That takes about 0.7 s for 8 weeks on London, or 1.9 s for 26. A stronger fix (per-agent random streams, so a change only perturbs the agents it touches) was not attempted.
  - In-memory rate limits are per server instance.
  - The co-pilot's Qloo tools use the file cache, which needs `QLOO_CACHE_DIR=/tmp/qloo` on Vercel (M7).

## M7 (ship): in progress (2026-10-14)
- **Live:** https://genusloci-culture-simulator.vercel.app (Vercel, GitHub auto-deploys from `main`). London, Singapore and **New York** load from a private Blob store; the co-pilot, scene names and interviews work in production.
- **New York:** Houston St at Broadway, 140 venues, 8 scenes, fidelity about 0.34 (the best of the three).
- **Repeated runs:** what-ifs run 4 paired seeded comparisons (mean, range, "clear" or "too small to call"); Scout averages 3. Mock-Latin scene names were removed, by user preference.
- **Onboarding:** a first-visit intro, with a "?" button to reopen it.
- **README** with the live link, screenshot, Qloo usage and setup; **Devpost draft** in [devpost.md](devpost.md).
- **Incident:** `vercel blob create-store` rewrote `.env.local` and removed the local `QLOO_API_KEY` (production is unaffected). The user needs to paste it back.

## M5e (Book for my venue): done (2026-10-14)
- **Plan a night here** on a venue panel opens a booking panel:
  - suggested acts (Qloo's artists for that venue's crowd, then artists sharing its tags);
  - add any artist; one the city doesn't know is looked up **live in Qloo** via `/api/outside-act`, which takes up to 3 calls, is cached, and stays above the 1,000-call floor. It's simulated as an event with that artist's fans' taste ("from Qloo: their fans also like …");
  - a run of 1, 2 or 4 weeks;
  - **Compare** runs 3 paired seeded futures per act and reports turnout, the change to **your own usual nights**, new fans, neighbour loss and scenes drawn;
  - **Book** schedules the event.
- **Co-pilot:** `throw_event` with `outside_artist: "<name>"` for artists not in the city.
- **Sim changes:** events can carry a taste profile; Scout and booking share one paired-run engine (`sim/events.ts`).
- **Verified:** at the ICA, slowthai, Jimothy Lacoste and Skepta were suggested, and Burna Boy was looked up via Qloo (a thin match: Trap, Rap), then compared and ranked. At Heaven after 4 weeks, Ghetts draws about 107 visits against 77 for girl in red, so the act matters.
- **Not done:** specific dates or nights (the sim can't schedule future actions).

## Next
1. ~~The user re-adds `QLOO_API_KEY`~~: done.
2. M7 leftovers:
   - ~~GitHub homepage~~: set to the live URL.
   - ~~Phone layout~~: done. Below the `sm` breakpoint the top bar shows city, date and fidelity; a Tools · Scenes · Co-pilot tab row opens one full-width panel at a time; placing something closes the tools panel. Desktop is unchanged.
   - a demo-runbook rehearsal on the live site.
3. Fit in: **M5e (Book for my venue)**, M5b-2 (specimen cards, phylogeny).
2. **M7 (ship):**
   - World hosting on Vercel;
   - LLM keys in Vercel env;
   - on-demand city builds with a budget guard;
   - onboarding;
   - README and Devpost write-up.
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
