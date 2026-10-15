# Deferred features: continuation handoff

<!-- generated: Codex continuation handoff; preserve user-authored content elsewhere -->

## User intent and repository state

Implement deferred functionality first; minimal functional controls are sufficient. User will handle UI overhaul and flow iteration later. They are handing the project back to Claude now.

- Branch: `codex/deferred-features`, based on `3b47ee1` (the earlier toolbar/scene tools handoff pushed to main).
- All new feature work is saved **uncommitted**. Many new modules/tests/docs are **untracked**; do not use reset/clean or discard them.
- Nothing from this branch has been pushed/deployed. Existing Claude session and dev server were not stopped. Local browser smoke testing used the existing server at localhost:3000.
- Plan: [deferred features](2026-10-14-deferred-features.md). Build operations: [on-demand world builds](../../on-demand-world-builds.md).

## Implemented

### Closure explanations

`src/sim/closures.ts` captures poor-health/manual/event-expiry evidence: tick, entity/cell, rolling weekly visits, capacity, rent-adjusted capacity, health, low-health duration and threshold. State clone/frame/history preserve evidence across event-slot reuse and rewind. `steps/venues.ts` records natural closures; `actions/apply.ts` records explicit closures/cancellations. `VenuePanel` and co-pilot venue inspection show real weekly visits and closure evidence; GameShell toasts use the recorded explanation. No speculative causal claims about competition were added.

### Continued scene ecology

`steps/ecology.ts` adds seeded residential moves (rent, local scene pull, distance; eight sampled destinations) and gradual resident turnover with friend refresh. Defaults are zero and consume no extra RNG when disabled. Demo opts in: `residentialMoveRate=.025`, `residentTurnoverRate=.008`, `sceneSplitSimilarity=.7`. Clustering can subdivide dispersed scenes only with population support and cosine improvement. Hook runs before outings in `step.ts`.

Offline synthetic London results, seeds 7/11/23, weeks 4–100: baseline moves 0; enabled moves 2349/2227/2278; moves during weeks 50–100 alone 1017/901/990. Assigned-to-assigned scene switches baseline 10/20/13, enabled 28/23/33. Six scenes remained; **no natural splits** occurred. Turnover unassigned transitions are counted separately. About 1.1–1.7 ms/tick enabled vs 0.8–1.1 baseline. Reproduce with `node node_modules/tsx/dist/cli.mjs scripts/measure-ecology.ts`. Venue taste-profile drift remains an older optional carry-forward idea, not implemented here.

### Dated bookings

Action schema accepts absolute `startTick`, optional `durationDays`, label and hostVenue; `cancelEvent` cancels planned/running bookings. `sim/scheduling.ts` stores calendar entries in snapshot-safe state. At the booked date normal resource/host validation runs again; failures are retained in calendar status. Exact day durations require daily ticks. Future horizon is 52 weeks, max pending bookings 64. Immediate events are also tracked; due events bypass duplicate tracking.

Booking comparison advances shared starting state to the chosen date, then compares identical-duration futures. Fans are measured from the booking date rather than before the lead-in. Worker/client/useSimulation/BookingPanel/GameShell carry dates and exact nights. `EventCalendar` shows every active entry plus recent history with cancellation. Co-pilot gets `event_calendar`, `start_tick`, `nights`, `cancel_event`. Event labels have dedicated venue state/frame fields so outside artists retain their names instead of displaying their taste proxy.

Reviewed edge cases fixed: complete booking before its venue slot is reused in a same-tick action batch; require host cell to match; disable planning edits during comparison; show all active bookings rather than hiding old pending ones behind recent history. Frame transmission is capped to active events + 12 historical bookings and 64 recent closure snapshots. Simulation state retains complete histories.

### On-demand builds

`world/builder/jobs.ts`, `job-store.ts`, `job-pipeline.ts`, `job-http.ts`, associated tests, `/api/world-builds/route.ts`; `world/store.ts` checks committed build outputs first. Authenticated GET status / POST bounded advancement. Registry city allowlist, private durable Blob CAS ledger/global 120s lease, immutable content-addressed publication, per-attempt durable quota debit, max four fetch attempts per request, 10s fetch timeout, per-build budget 20–180 calls, at least 1000 reserve. Existing gather/assemble/heatmap/equilibrate pipeline is reused. Request-cache checkpoints allow repeated bounded calls to resume a stage.

Core API and synthetic real-pipeline test passed in isolation and independent review. **New final expansion is unfinished:** monthly quota reconciliation + month rollover blocking have red tests in `jobs.test.ts` but no implementation. `/build-city` operator page was requested but is not created. Build subagent reached its usage limit after writing the red tests; no agent remains actively editing.

## Latest verification and exact failures

- Before monthly quota test additions: full suite reached 429 passing / 1 failure, solely a co-pilot tool-list expectation. That expectation was updated for event_calendar.
- Latest full `npm test`: **437 total, 434 pass / 3 fail**, 83 files. Failures:
  1. `src/world/builder/jobs.test.ts`: `blocks monthly rollover until explicit current-period quota reconciliation` — status is ready instead of blocked.
  2. Same file: `validates quota figures and refuses reconciliation during an active lease` — `reconcileQuota` is not implemented.
  3. `src/world/builder/job-pipeline.test.ts`: synthetic concrete pipeline exceeded default 5000ms under concurrent full-suite load (~7s). It passed alone. Inspect for real slowness / use a justified bounded integration-test timeout.
- Latest completed `npm run lint` passed, but further metadata/calendar changes were made afterwards; rerun.
- Latest completed `npx tsc --noEmit` passed before the final event-label fields and quota tests; rerun. New quota tests will likely also cause missing-method compile errors.
- Final production build for this feature batch **has not run**.
- Focused scheduling/booking/VenuePanel tests passed after event-label integration (11 tests). Earlier independent review passed 38 scheduling/closures/worker/co-pilot tests, 23 ecology tests, 15 build tests (before new quota tests).
- Browser: loaded real local London, played/paused, saw scenes and struggling-venue notifications, placed a club. Full dated booking/calendar end-to-end and operator controls still need browser verification. No live Qloo build was run; no quota was spent on build tests. Temporary browser state is disposable.

## Next steps

1. Implement `createBuildService().reconcileQuota(remaining, period)` matching existing red tests: integer 0..10000, current UTC YYYY-MM only, no active lease, durable CAS; store quota period and block network work across month rollover until explicit reconciliation. Wire an authenticated HTTP operation and tests. Environment estimate must not silently replenish an existing debit ledger. Account for unrelated Qloo consumers: estimate can only be conservative; observed server remaining caps it.
2. Add minimal `/build-city` operator controls: token in component memory only, registry city selection, budget, start/continue/retry/status and explicit quota reconciliation. Do not store token in URLs/localStorage or touch `.env.local`. Required env names are in `.env.example`; none were configured in production.
3. Recheck integrated schedule behavior and UI, including future one-night booking, cancellation, start failure, rewind and outside labels. Improve tests for calendar active-history retention / blocked editing if useful. Review immediate-event calendar tracking and frame history bounds after latest edits.
4. Run `npm test`, `npm run lint`, `npm run build`, `git diff --check`. npm runs the existing scripts; pnpm and rg are unavailable in this PowerShell environment. `node`, npm and git are available. Use Get-ChildItem/Select-String instead of rg if still unavailable.
5. Update roadmap status and stable handoff with actual results. Make atomic Conventional Commits (simulation lifecycle, UI/co-pilot, builds, docs as appropriate), then integrate/push only after verification. Existing `main` remains at the earlier pushed state.

## Constraints

Preserve all prior Claude work and user-authored content. No credentials or Qloo payloads in Git. No absolute user-specific paths in committed docs. Do not rewrite `.env.local` via Vercel CLI. General sim defaults remain backward compatible; ecology opt-in is enabled only in demo. No UI overhaul is part of this task.
