# Qloo API notes (M3 spike, 2026-10-13)

<!-- generated: maintained by agents. Findings only; no Qloo response data (Qloo terms). -->

What we learned by calling the hackathon server. Access details are in [architecture.md](architecture.md#qloo-access).

## Limits (from response headers)

- **5 requests per second**: `X-Second-RateLimit-Limit/Remaining/Reset`, where `Reset` is in seconds.
- **10,000 requests per month**: `X-Month-RateLimit-Limit/Remaining/Reset`, with a window of about 30 days from first use.
  - The spike used about 35 of them.
  - This is the binding constraint, so every call must be cached, and on-demand city builds need a budget guard.
- Going over the per-second limit returns `429 {"error_msg":"Rate limit exceeded"}` with no `Retry-After`.
  - A 429 does **not** count against the monthly quota.
  - Wait for `X-Second-RateLimit-Reset` (or 1 s) and retry.
- Latency:
  - small calls take about 0.8 s;
  - `take=50` place pages take about 6 s and weigh about **1.1 MB**, about 22 KB per place, mostly verbose properties such as `akas`, `hours`, `localities` and `images`.
  - Trim responses before caching.

## Endpoints that work

| Call | Notes |
|---|---|
| `GET /search?query=&types=urn:entity:place&take=` | `results[]` with `entity_id`, `name`, `types[]`, `properties`. |
| `GET /entities?entity_ids=` | Looks entities up by ID; same shape as search. |
| `GET /v2/insights?filter.type=urn:entity:place&filter.location=POINT(lon lat)&filter.location.radius=<m>` | Venues in a circle. WKT puts **lon first**. `take` is 1–50 (a higher value gives a 400). Paging with `offset` works: central London still returned results at offset 1000. Results are ranked by popularity, and tourist landmarks come first. |
| `… &filter.tags=urn:tag:genre:place:night_club` | Restricts results to one venue genre. |
| `… &signal.interests.entities=<artist id>` | **Cross-domain:** places ranked for fans of an artist, with `query.affinity` from 0 to 1. |
| `filter.type=urn:entity:artist&signal.interests.entities=<place id>` | Artists for a venue's crowd. |
| `filter.type=urn:entity:artist&signal.location=POINT(..)&signal.location.radius=` | Artists popular in an area. Mostly global pop, so a weak local signal. |
| `filter.type=urn:tag&signal.interests.entities=<id>` | Taste analysis: an entity's tag affinities, mixing music, cuisine and vibe tags. |
| `filter.type=urn:heatmap&filter.location=…&filter.location.radius=…&signal.interests.entities=<id>` | Returns `results.heatmap[]`, where each item has `location{latitude, longitude, geohash}` (a **7-char geohash**, about 150 m) and `query{affinity, affinity_rank, popularity}`. A 1.5 km radius gave 182 cells for an entity signal. |
| heatmap with `signal.interests.tags=urn:tag:genre:place:night_club` or `signal.demographics.audiences=urn:audience:communities:lgbtq` | Both work, returning about 450 cells, which are **not clipped to the radius**. Clip them ourselves. |
| `filter.type=urn:demographics&signal.interests.entities=<id>` | Age-band and gender skews from −1 to 1. |
| `GET /v2/audiences/types` | Audience families: communities, hobbies_and_interests, life_stage, leisure, professional_area, … |
| `GET /v2/audiences?filter.audience.types=urn:audience:communities` | Audience URNs. It needs at least one filter, or it returns a 400 that lists the allowed filters. |
| `GET /v2/tags?filter.query=techno` / `?filter.tag.types=urn:tag:genre:place` | Tag search. Place genres look like `urn:tag:genre:place:restaurant:bar`. |

## Shapes we rely on (field names only)

- **Insights entity:**
  - core fields: `entity_id`, `name`, `subtype` (for example `urn:entity:place`), `popularity` (0–1), `query.affinity` (when a signal was given);
  - `location {lat, lon, geohash}` (places);
  - `tags[] {id, name, type}`, often 100+ per place;
  - useful properties: `properties.{address, geocode, price_level, business_rating, keywords[], description, is_closed, live_music}`.
- **Search and entities results** use `types[]` instead of `subtype`.
- **Every insights response** is wrapped in `{ success, results: { entities | tags | heatmap | demographics } }`.
- **Errors** come in two forms: `{ errors: [{ message, path }] }` for a 400, or `{ error_msg }` for a 429.

## Gotchas

- **Invalid values are silently ignored** and come back as an empty 200. Two examples:
  - `filter.tags=urn:tag:genre:place:bar` returns nothing, because the real tag is `urn:tag:genre:place:restaurant:bar`.
  - A music-genre tag (`urn:tag:genre:music:techno`) as a heatmap signal returns an empty heatmap.

  Treat an empty result that has signals as suspect, and resolve tags with `/v2/tags` first.
- **`filter.location.query`** (for example "Shoreditch, London") expands well beyond the neighbourhood. Use a `POINT` plus a radius.
- **No field filtering:** responses are verbose.
- **Singapore** has plenty of coverage within 1.5 km of the centre (results at offset 450).

## Implications for M4 (World builder)

- **Venues:**
  - page through places in the city circle, both unfiltered and per genre tag (night_club, restaurant:bar, restaurant:pub, art_gallery, live music, …);
  - map their genre tags to our venue `kind`;
  - each place's own tags are its genome, at no extra call.
- **Taste entities:** one call per anchor venue for its artists gives affinity edges between venues, artists and tags.
- **Calibration:** heatmaps per anchor entity, clipped to the city radius, with geohash cells mapped to our cells.
- **Rough budget:** about 150–300 calls per city. That is fine for the prebuilt cities. On-demand judge builds need a monthly floor and a per-build cap.
