# On-demand world builds

This operator feature builds **registered cities only**: London (`london`), Singapore
(`singapore`), and New York (`newyork`). It uses each city's existing `public/geo`
geometry. Arbitrary city search, geocoding, geometry generation, automatic scheduling,
and replacement/rebuilding of completed jobs are not implemented.

## Configure

Set server-side environment variables through your normal local/deployment configuration:

- `WORLD_BUILD_TOKEN`: a long random operator secret. Do not expose it in client bundles.
- `BLOB_READ_WRITE_TOKEN`: a **private** Vercel Blob store token. This is required locally
  as well as in deployment; checkpoints never rely on an instance's ephemeral disk.
- `QLOO_API_KEY`: the existing Qloo credential.
- `WORLD_BUILD_QUOTA_REMAINING`: a conservative, verified count of monthly calls remaining,
  used to initialize the ledger. An unknown quota blocks network work. The count includes
  calls already used elsewhere; do not put an assumed monthly allocation here.
- Optional `QLOO_BUDGET_FLOOR`: the build floor is always at least 1000, even if the existing
  Qloo environment setting is lower.

The durable remaining estimate only decreases and is clamped down by Qloo's response
headers. Changing `WORLD_BUILD_QUOTA_REMAINING` cannot replenish an initialized non-null
estimate. Other applications using the same Qloo key can consume quota outside this ledger;
verify the count and avoid running another high-volume caller concurrently.

**Monthly reconciliation.** The ledger records the UTC month (`YYYY-MM`) its estimate belongs
to. When a new month begins, builds stop before any network work (status `blocked`) until an
operator reconciles: they read the real remaining count (Qloo dashboard or a response's
`X-Month-RateLimit-Remaining`) and submit it for the current month. Reconciliation replaces the
estimate, accepts only the current month and integers 0–10000, and is refused while a build holds
the lease:

```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/api/world-builds' -Method Patch -Headers $buildHeaders -ContentType 'application/json' -Body '{"remaining":9600,"period":"2026-11"}'
```

`GET /api/world-builds?city=…` also returns `quota: { remaining, period, currentPeriod, floor }`.

## Operator page

`/build-city` wraps the API: paste the operator token (kept in page memory only, never in the URL
or browser storage), choose a registry city and call budget, then **Start** / **Continue** /
**Retry** and **Refresh status**. The quota section shows the estimate and its month and submits
reconciliation. The page is not linked from the game and is marked `noindex`.

## Advance and inspect

In PowerShell, with the operator token already in the current process environment:

```powershell
$buildHeaders = @{ Authorization = "Bearer $env:WORLD_BUILD_TOKEN" }
Invoke-RestMethod -Uri 'http://localhost:3000/api/world-builds' -Method Post -Headers $buildHeaders -ContentType 'application/json' -Body '{"city":"london","maxCalls":180}'
Invoke-RestMethod -Uri 'http://localhost:3000/api/world-builds?city=london' -Headers $buildHeaders
```

Repeat POST to advance; GET never performs work. Omit `maxCalls` on subsequent requests
to preserve the existing budget. Each POST executes at most one stage and four network
attempts, with a ten-second timeout per Qloo attempt and a 35-second network-work deadline.
The route has a 60-second deployment execution limit. Stages are `gather`, `heatmaps`,
`equilibrate`, and `publish`. Network retry/backoff is deliberately handled by explicit
operator advancement rather than unbounded work in one request.

For a failed stage, fix its configuration or upstream problem, then request:

```powershell
Invoke-RestMethod -Uri 'http://localhost:3000/api/world-builds' -Method Post -Headers $buildHeaders -ContentType 'application/json' -Body '{"city":"london","retry":true}'
```

A job permits at most three failed advances. Its per-build budget is fixed when created,
between 20 and 180 attempts; failed/timed-out calls count. A job blocked at its total call
limit or the quota floor cannot spend more by retrying. A job initially blocked because
the quota was unknown can resume after configuring the bootstrap count and retrying.

Responses contain only operator status, never raw Qloo checkpoints. HTTP statuses:
202 ready/in progress, 200 completed/status, 401 unauthorized, 400 invalid input,
409 busy/budget blocked/budget mismatch, 502 stage failed, 503 disabled/storage unavailable.
Status responses use `Cache-Control: private, no-store`. A completed build is served by the
existing `/api/world/<city>` endpoint; reload the city's world to use it.

## Durability and recovery

The private `world-builds/ledger.json` stores stage state, trimmed per-query response cache,
call debits, and a global lease. Origin reads bypass the Blob CDN. ETag conditional writes
provide compare-and-swap across server instances, and create-if-absent deduplicates initial
requests. Only one city build can advance at a time; this also serializes build quota debits.

The lease lasts 120 seconds. After a killed request, wait for lease expiry and POST again.
Cached successful queries and deterministic invalid-signal responses are replayed without
spending quota. A dispatched request is debited before it starts, so a crash can overcount
but cannot refund a potentially spent request. An uncached in-flight request can be retried
after a crash and is charged again. This provides bounded attempts, not exactly-once Qloo
delivery.

Completed worlds use content-addressed private output objects. A successful ledger CAS is
the visibility commit: an expired worker can leave an unreferenced object, but cannot expose
its output over a successor. The normal world store reads committed builds before older
local or uploaded worlds. It keeps existing worlds available during a build-store outage.
Private output/checkpoint cleanup and manual administrative job reset are future work;
do not delete the live ledger to bypass a quota limit or an active lease.

## Offline verification

```sh
pnpm test src/world/builder/jobs.test.ts src/world/builder/job-http.test.ts src/world/builder/job-pipeline.test.ts
```

Tests inject synthetic fetch/storage dependencies, including an end-to-end run of the real
gather, assemble, heatmap, equilibrium, and validation code. They make no live Qloo calls.
