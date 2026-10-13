# M3 — Qloo spike + client

**Goal:** one typed, server-side Qloo client that every later milestone uses (the M4 world builder and the M6 co-pilot tools). It must never waste the 10,000-a-month quota.

**Spike findings:** [../../qloo-notes.md](../../qloo-notes.md). The spike is done.

## Design

`src/qloo/`, pure TypeScript with no Next.js imports, so the tsx CLI scripts can use it too.

- **`transport.ts`: `createTransport({ apiKey, baseUrl, fetch, now, sleep, cache, budgetFloor, maxRetries })`**
  - Builds the URL from a path and a params map (arrays are joined with commas; params are sorted so cache keys are stable). Sends `X-Api-Key`.
  - **Throttle:** at most 4 request *starts* per rolling second, under the server's 5.
  - **Retry:**
    - a 429 waits `X-Second-RateLimit-Reset` (default 1 s) and retries, up to `maxRetries` times;
    - a 5xx or network error backs off exponentially (0.5 s, 1 s, 2 s, …);
    - any other 4xx throws `QlooError` with the server's message.
  - **Budget:** reads `X-Month-RateLimit-Remaining`. Once it falls below `budgetFloor`, further network calls throw `QlooBudgetError`, while cached calls still work.
  - **Cache:** `QlooCache { get(key), set(key, value) }`. The key is a sha256 of the path and sorted params; the value is the **trimmed** parsed result.
  - `stats()` reports network calls, cache hits, 429s and the last remaining monthly count.
- **`cache.ts`:**
  - `memoryCache()`;
  - `fileCache(dir)`, which writes one JSON file per key under `.cache/qloo/` (git-ignored).
- **`schemas.ts`:**
  - zod schemas for the fields we use (entity, place location, tag, heatmap cell, audience, demographics);
  - `trim*` helpers that drop verbose properties before caching.
- **`validate.ts`:** request validation before any call, so silent-ignore bugs can't happen:
  - tag values start with `urn:tag:`;
  - audiences start with `urn:audience:`;
  - entity IDs are UUIDs;
  - `take` is 1–50 and `radius` is greater than 0;
  - longitude and latitude are in range.
- **`client.ts`: `createQlooClient(transport)`:**
  - `search(query, { types, take })`
  - `entities(ids)`
  - `places({ at, radiusM, tags?, signalEntities?, take, offset })`
  - `recommend(type, { signalEntities?, signalTags?, audiences?, at?, radiusM?, take })` for artists, books and so on
  - `tagAffinities({ signalEntities, take })` (filter.type=urn:tag)
  - `heatmap({ at, radiusM, signalEntities? | signalTags? | audiences? })`, clipped to the radius
  - `demographics(ids)`
  - `audienceTypes()`
  - `audiences({ types, take })`
  - `searchTags(query | { tagTypes }, { take })`

  Each result also carries `suspectEmpty: true` when it is empty although a signal or filter was given.
- **`env.ts`: `qlooFromEnv()`.** Reads `QLOO_API_KEY` (and optionally `QLOO_BASE_URL`) and throws a clear error if the key is missing. It never logs the key.
- **`scripts/qloo-smoke.ts` (`pnpm qloo:smoke`):** a handful of live calls through the file cache (search, places, heatmap, tag affinities). It prints counts and the remaining quota only, never response data.
- **`.env.example`:** lists the variable names.

## Tasks (TDD, atomic commits)

1. Transport: URL building, throttle, retries, budget, errors. Tested against a fake fetch, clock and sleep. `feat(qloo): add throttled, retrying, budget-aware transport`
2. Caches: memory and file. `feat(qloo): add memory and file caches`
3. Schemas, trimming and validation. `feat(qloo): add response schemas, trimming and request validation`
4. Client methods, including `suspectEmpty` and heatmap clipping. `feat(qloo): add typed client methods`
5. Env loader, smoke script, `.env.example`, and a live run. `feat(qloo): add env loader and live smoke script`
6. Docs: architecture, current state, roadmap.
