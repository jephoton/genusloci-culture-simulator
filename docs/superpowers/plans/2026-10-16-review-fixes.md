# Independent Review Fixes

**Goal:** Resolve the six correctness findings reviewed at `894194f`, preserving the existing UI and simulation model.

**Approach:** Reproduce forecast errors with simulation regressions; bind transient UI state to timeline identity; remove world-specific numeric indices from the outside-artist network boundary; honor persisted operator job budgets.

- [x] Preserve existing reservation priority in dated event previews.
- [x] Count candidate attendance only for that event's lifetime, including its final tick.
- [x] Invalidate booking results and pending responses when the host or timeline snapshot changes; guard Book against missing venues.
- [x] Resolve outside-artist data against the caller's actual World, including older clients after publication.
- [x] Discard abandoned lineage names and stale naming responses across rewind.
- [x] Continue existing build jobs with their persisted immutable budget after reload.
- [x] Independently review fixes, run focused and full tests/lint/build, update stable handoff notes, and commit each logical concern separately.

Testing uses synthetic worlds and injected HTTP responses. No live Qloo build, production environment change or UI overhaul is required.

Verified with 452 tests in 89 files, ESLint, production build and whitespace checks. Browser smoke checks covered local act comparison followed by planner invalidation on rewind and the disabled operator API. Live LLM naming was unavailable locally (503); hook regression tests cover its asynchronous lifecycle.
