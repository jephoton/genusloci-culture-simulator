# M4 — World builder (real Qloo cities)

**Goal:** London and Singapore run on real Qloo data, replacing the synthetic population:
- real venues, at their real locations and with their real kinds;
- residents whose tastes are built from real place tags and artists;
- fidelity measured against real Qloo heatmaps.

**Inputs:**
- [qloo-notes.md](../../qloo-notes.md)
- the M3 client in `src/qloo`
- the OSM geometry in `public/geo/<city>.json`

**Out of scope (later):**
- on-demand builds for a judge's own city. These need the budget guard and a progress UI, so they move to M7 or a later M4 follow-up.
- hosting World files on Vercel. They can't be committed, so M7 picks blob storage or a build-time step.

## Data model (unchanged `World` v1, plus optional `meta`)

| World part | From Qloo |
|---|---|
| **Venues** (`type: "place"`, with `cell`, `kind` and `capacity`) | Place insights in the city circle, one union-of-tags query per kind (see below). Kind comes from the venue's own genre/category tags by priority, falling back to the query's kind. At most 4 venues per cell (by popularity), because cells have 6 landmark pads and openings need room. Venues over the cap stay as **reserve places** (no `cell`) that the niche logic can open. |
| **Place tags** (`type: "tag"`) | The venues' own tags, limited to taste-bearing types: ambience, category, interests, customer identity, inclusivity, activity, decor, culinary style, cuisine, noise level, age range, time of day. A tag must appear on at least 3 venues and at most 70% of them. Up to 120 tags. |
| **Artists** (`type: "artist"`) and **music tags** | Artist recommendations for anchor venues (clubs, music venues and bars, by popularity, until 30 have succeeded; `isInvalidSignal` venues are skipped). The artists' genre, subgenre and style tags become music-tag entities when shared by at least 2 artists. |
| **Edges** (symmetric) | venue–tag (IDF-weighted); venue–artist (by recommendation rank); artist–music tag; artist–artist (co-recommended); venue–venue (top 4 by tag cosine); tag–tag (top 4 by co-occurrence) for drift. |
| **Archetypes** | Spherical k-means (k = 8, seeded) over the venues' TF-IDF tag and artist vectors. An archetype's genes are its centroid's top 10 tags plus the 8 artists most recommended for its venues. Its name is its two most distinctive tags. |
| **Cells** | A 300 m grid over the OSM bounds that skips water. Density comes from street length (shared with the synthetic city). A cell's archetype mix is a kernel density of each archetype's venues (σ 400 m, popularity-weighted), blended with 15% uniform. So residents start near venues of their taste, which comes from where Qloo's venues are, not from the heatmaps. |
| **Heatmaps** | One per archetype, on its top artist (or its top venue if the artist has no data), averaged into our cells. They are used **only for fidelity**, so the score isn't circular. |
| **Capacity** | Kind weight (club 1.5, music venue 2, bar 0.8, café 0.5, restaurant 0.7, gallery 1.2, shop 0.4, stadium 4, other 1.5) × (0.6 + 0.4 × popularity). It is normalised so all venues together hold `capacityTotal` weekly visits (default 1,800, matched to the demo's agents and outing rate). |

**Call budget per city:** about 12 kind queries, up to about 50 artist calls (cached failures included) and 8 heatmaps, so roughly 70–80. Reruns are free thanks to the file cache.

**Kind queries** (one union `filter.tags` call per kind, take 50; tags are verified to return results and logged when empty):

| Kind | Tags |
|---|---|
| club | `night_club`, `gay_night_club` |
| bar | `pub`, `restaurant:cocktail_bar`, `restaurant:wine_bar`, `restaurant:bar`, `brewery` |
| café | `restaurant:cafe`, `restaurant:coffee_shop` |
| restaurant | `restaurant` |
| gallery | `art_gallery`, `museum` |
| music venue | `live_music_venue`, `concert_hall`, `jazz_club` |
| shop | `record_store` |
| stadium | `stadium` |
| other | `performing_arts_theater` |

## Code

- `src/world/grid.ts`: the water-skipping grid and street-length density, extracted from the synthetic city.
- `src/world/builder/`:
  - `kinds.ts`: kind queries, `kindOf(tags, fallback)`, capacity weights.
  - `assemble.ts`: **pure** `assembleWorld(bundle) → World`, plus `heatmapTargets(world)` and `attachHeatmaps(world, results)`. It covers venue selection, tags, edges, k-means, archetypes, cells and capacity.
  - `gather.ts`: the only module that calls Qloo. `gatherCity(client, city, onProgress)` returns the `CityBundle`, and `gatherHeatmaps(...)` fetches the heatmaps.
- `scripts/build-world.ts` (`pnpm build:world <city>`): writes `.cache/worlds/<city>.world.json` (git-ignored) and prints a summary and the calls used.
- `src/app/api/world/[slug]/route.ts`: serves the cached World file (404 when it's missing).
- `useCityWorld`: tries the Qloo World first, then synthetic-over-OSM, then Synthville. Shows "Taste data: Qloo" attribution.
- `scripts/calibrate.ts --world=<city>`: runs the real World with `DEMO_CONFIG` and reports fidelity, ecology and venue health, to tune capacity and auto-open.

## Tasks (TDD where pure; atomic commits)

1. Extract `grid.ts` (refactor; existing tests stay green).
2. `kinds.ts` with tests.
3. `assemble.ts` with tests on synthetic `QEntity` bundles: selection and cap, tag filter, edges symmetric and in range, deterministic k-means, archetypes, cells summing to 1, capacity total, schema-valid output, heatmap attach.
4. `gather.ts` with a fake-client test.
5. `build:world` CLI. Build London and Singapore live.
6. API route plus `useCityWorld` and attribution.
7. Calibrate on real worlds and tune `DEMO_CONFIG` and builder defaults.
8. Browser check (real names, kinds, crowds, events with real artists, no console errors); update docs.
