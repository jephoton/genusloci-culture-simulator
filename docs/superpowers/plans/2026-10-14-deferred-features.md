# Deferred Features Implementation Plan

> **For agentic workers:** Use subagent-driven-development for implementation and review, and dispatching-parallel-agents for independent file ownership. Follow test-driven-development for engine and server changes.

**Goal:** Add closure evidence, continuing scene ecology, dated bookings and bounded on-demand world builds without redesigning the UI.

**Architecture:** Keep simulation changes deterministic and snapshot-safe. Store scheduling and closure evidence in simulation state; expose them through worker frames and existing panels. World builds run server-side in bounded resumable stages using private storage, with operator authentication and a quota floor.

**Tech Stack:** TypeScript, Vitest, Next.js 16 route handlers, Qloo client, private Vercel Blob.

## Tasks

- [ ] Closure evidence: record automatic closure, manual closure and event expiry separately; include actual visits, rent-adjusted capacity, low-health duration and nearby competition. Show reasons in venue inspection and closure notifications. Test classification, persistence, clone isolation and slot reuse. Own closure module, venues step, state evidence fields, frame evidence and VenuePanel.
- [ ] Scene ecology: first reproduce stagnation with measurements; add conservative, configurable seeded residential movement/turnover and dispersed-scene splits where supported by evidence. Keep defaults backward compatible, enable in demo, and measure long-run scene membership and spatial changes across seeds. Own ecology step, clustering, config and demo config. Coordinate the step hook with the scheduling task.
- [ ] Dated events: support absolute start ticks and day durations, validated bounded scheduling, cancellation, snapshot/fork/rewind persistence and execution errors. Preview dated bookings against a baseline over the same horizon. Add week/day and duration controls to booking, expose scheduled events and cancellation in the UI and co-pilot. Own action schema/apply, scheduling state fields, step hook, timeline, events/booking, worker and booking UI.
- [ ] On-demand builds: implement authenticated POST advancement and GET status, with private durable checkpoints, bounded Qloo calls, retry/resume, deduplication and a hard quota floor. Reuse existing gather/assemble/equilibrate pipeline; serve resulting worlds through existing store. Add minimal operator controls or documented callable API. Test invalid input, auth, budgets, resume, failure and completion using synthetic data. Own world builder job modules/routes/store, Qloo budget support where needed and operator panel.
- [ ] Review each subsystem for scope then quality, integrate engine hooks, run `npm test`, `npm run lint`, `npm run build`, simulation calibration/benchmark, and local browser smoke tests where available. Update architecture, current state and roadmap. Commit changes atomically.

## Acceptance boundaries

Simulation dates are week/day coordinates, not wall-clock dates. Future events can fail at their start if resources are no longer available; report those failures. Closure reasons state measured causes, not unproven counterfactuals. Ecology remains a model and must not manufacture guaranteed splits. No live Qloo builds are needed to validate the feature; synthetic responses test execution without consuming quota. Build writes are authenticated and checkpoint data never enters Git. Production UI styling and flow redesign are deferred by the user.
