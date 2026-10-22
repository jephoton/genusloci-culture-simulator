# Live cases and change-history playback

<!-- generated: implementation plan for the user's approved live-city case flow -->

**Goal:** After explicit apply, play a focused live-city case, stop it at settling or a bounded observation limit, then show observed outcomes. Preserve rewind through named change checkpoints instead of calendar/week labels.

**Architecture:** A worker-owned case monitor records actual outings and venue health and stops before scheduling another tick. The React simulation adapter exposes active case/completion events; chat receives deterministic observed summaries after completion. Focus is preserved during venue inspection and exits only through explicit finish/resume/reset/rewind.

**Decisions:** Live city, not a separate preview (user confirmed). Rewind remains available. Internal step/week cadence remains an engine detail. Settling is a disclosed heuristic over complete activity cycles, never a quiet single night or proof that all consequences ended. Maximum observation length guarantees completion. Predictions before apply are replaced by a readiness message; observed results appear after playback.

- [x] Worker case monitor, bounded play, pause/resume/speed semantics, completion reports and regression tests.
- [x] Adapter case lifecycle and named change history/checkpoint rewind.
- [x] Visible bottom playback; venue name/health card; relevant-only selection preserving focus; fixed-colour case beacons.
- [x] Chat finish/resume commands, deferred observed summaries, no main-surface calendar/week labels.
- [x] Focused and full verification, independent spec/code review, browser rehearsal, handoff updates.

Validation: 618 tests in 107 files, lint and production build including TypeScript passed. Browser rehearsals covered empty/populated closure cases, automatic cap completion, inspection lock, history rewind and finish/resume. Settling, delayed events and presentation timing use automated regressions. Current state and limits are recorded in `docs/current-state.md` and decision 0008.

Completed follow-up: valid new interventions replace the current observation automatically; Exit case/view pauses and releases focus; busiest-venue inspection highlights snapshot-safe recorded recent visitors. User changed the beacon decision to closest live taste-scene hue instead of fixed cyan. Follow-up verification: 630 tests in 108 files, lint, production build and browser replacement/exit/visitor checks. See the latest current-state entry for limits and evidence.

Playback amendment completed: applied cases arm paused; visitors use bottom Play/Pause. Chat playback/finish requests supply button guidance. Automatic endpoint stopping remains. Placeholder background buildings are no longer mounted. Verification: 632 tests in 108 files, lint, production build/TypeScript and browser manual-control checks.
