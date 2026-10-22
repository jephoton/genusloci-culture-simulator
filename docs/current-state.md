# Current State

<!-- generated: maintained by agents -->

## Suggested-prompt keyboard completion (2026-10-22)

Following the user's clarification, Right Arrow fills the exact placeholder displayed inside the input box. The separate suggestion below the input has been removed. The initial placeholder is “What if the busiest club closes?”; the latest assistant reply's explicit recommendation can replace it. With the input empty or holding a matching prefix and the caret at the end, unmodified Right Arrow fills that placeholder without sending. Selected text, middle-of-draft cursor movement, modifiers and IME composition preserve normal editing. Unrelated drafts are not replaced. AI instructions request a stable `Suggested prompt:` line when recommending a next question; recommendations cause no additional provider calls.

Browser checks confirmed empty-input fill, no submission, normal cursor movement within a prefix and completion at the end. All nine targeted completion/copilot tests, TypeScript and targeted ESLint passed. Regressions cover extraction, quoted venue names, apostrophes, prefix matching and selection/caret guards. See [walkthrough](chat-lab-walkthrough.md). No provider order, environment, merge, push or deployment changes.

## Gemini-first chat routing (2026-10-22)

The user selected **Gemini Flash-Lite → Groq → deterministic local parsing**. This now replaces both the old provider order and local-first question routing. Only Gemini/Groq participate in automatic model selection; other registered providers remain explicit-probe options. Gemini defaults to the live-tested `gemini-3.5-flash-lite` for both tiers. Environment model overrides are honored; the local configured chain was verified as Flash-Lite then GPT-OSS 120B, without printing keys.

Initial stream errors, reasoning-only failures and empty completions fall through before text/tool activity. Started answer/tool streams are not replayed through another provider. Exhausted AI questions are interpreted locally automatically; unsupported language receives clarification. Explicit live changes/playback/rewind stay local, and AI handoff clears stale local action references. No duplicate live action can be introduced by provider fallback. Existing cooldown applies after an exhausted chain, not a successful backup response. See [decision 0007](decisions/0007-gemini-first-chat.md) and [updated walkthrough](chat-lab-walkthrough.md).

Browser rehearsal of the actual chat completed a fresh city-summary tool round and answered 2,500 residents / 140 open venues. Disabling AI produced the local summary; AI was re-enabled afterward. Mock regressions exercise initial provider failure, empty/reasoning-only responses, no replay after tool start, provider order and local fallback. Independent review's empty/reasoning-only stream finding was reproduced and fixed. Final verification: 570 tests across 101 files, lint, and production build including TypeScript passed. Provider failure branches use mocks; no deliberate live quota exhaustion or browser network-failure injection was performed. No credentials, paid plans, merge, push or deployment changed.

## Free LLM provider evaluation (2026-10-22)

The following describes the evaluation stage; its unchanged-priority limitation was subsequently resolved by the Gemini-first routing above.

[Provider findings](spikes/2026-10-22-llm-provider-options.md) now favor Gemini Flash-Lite after the user supplied its key locally. It passed three live schema probes (lookup, comparison, summary) and a two-request production `copilotStream` continuation with synthetic browser tool output: selected fresh summary and answered correctly in 2,651 ms. Flash passed lookup but failed comparison with an unclassified error. Seven Gemini requests total, no observed 429; sustained reliability, actual browser/worker rehearsal and project quotas remain unverified. Earlier Groq probes each passed lookup but failed comparison with HTTP 400 tool generation failure, distinct from earlier 429s. No Qloo or live-city calls. Cerebras offers a limited trial rather than a permanently free tier; OpenRouter's free plan has a small daily allowance.

`scripts/spike-llm-providers.ts` provides dry inventory and explicit per-provider live probes, with no retries or automatic fallback. `scripts/spike-gemini-chat.ts --live` reproduces the bounded streamed continuation. TypeScript and targeted ESLint passed. No application provider settings, credentials, billing or production behavior changed by the agent. The app still tries configured Groq before Gemini; its Gemini copilot default needs a verified model override. Before switching, verify actual quotas, browser continuation and provider-specific cooldown behavior.

## Chat-first lab entry and LLM-necessity spike (2026-10-22)

The user approved the learner/portfolio cultural-ecology narrative and requested chatbot-only entry with reused tools and an LLM-free fallback. `LabChat` is now the sole visible command surface. Legacy workspaces remain in source under a hidden compatibility container; underlying closure/opening/rent/inspection/comparison tools are reused through `runCityTool`. Map inspection remains possible; chat is minimizable. The former intro/menu/toolbar and routine toasts are not visible. Attribution remains visible. Background LLM scene naming is disabled.

Deterministic commands cover help/model explanations, summaries, venue/scene lookup, rankings, closure/opening/rent comparisons and explicit local live actions. Exact playback/rewind commands also work. Comparisons render recorded totals and seeded ranges without a model call. Optional AI handles unsupported questions using bounded local evidence and fresh city facts; it has no advertised live-apply tool, and failed AI requests are not replayed. Handoff clears previous local action/target references. Successful rewind clears references/AI context; failure is reported without claiming success. No provider/environment changes were made.

The language spike scored 8/14 on a small post-implementation synthetic phrasing challenge, with zero unintended writes. Six reasonable paraphrases were refused: unrestricted LLM parity is not achieved or claimed. See [agentic requirements and findings](spikes/2026-10-22-chat-agent-requirements.md) and [current walkthrough](chat-lab-walkthrough.md). Published rules do not explicitly mandate an LLM; they do require an agentic tool/framework/existing-agent integration. Organizer acceptance of a wholly deterministic route remains unconfirmed.

Browser rehearsal with AI disabled covered a four-week/four-seed venue closure comparison without live advance, explicit apply, calendar-date advance on the applied action and successful rewind. Earlier parser review regressions cover ambiguous/negated/declarative/question punctuation forms. Full guided experiment playback, richer affected-entity overlays and resident taste/route traces remain future work; this chat change does not claim to implement those earlier proposals.

Final verification: 562 tests across 100 files, lint, TypeScript and production build passed. Independent review findings about punctuation, declarative commands, stale AI/local targets, rewind failure reporting and optional-AI policy were addressed. `npx tsx scripts/spike-chat-language.ts` reproduces the 8/14 language result without Qloo/provider calls. Changes are local on `feat/focused-city-interface`; no merge, push, deployment, key changes or paid-provider setup was performed. No live LLM head-to-head benchmark or provider-failure browser simulation was performed in this pass.

## Three direction spikes completed (2026-10-22)

The user authorized promoter, cross-domain Qloo and ALife-purpose spikes, explicitly valuing a portfolio ALife project independently of commercial utility or hackathon results. [Spike index](spikes/README.md) integrates the findings. Recommendation: a playable cultural ecology laboratory is the strongest fit for that goal; do not force a forecasting/product claim to retain the engine. This is a recommendation, not an approved application redesign.

Three artist-conditioned London scouting briefs were generated from live Qloo evidence in ignored `.cache/spikes/product-direction/`. Affinity changed rankings but surfaced unverified/inappropriate performance formats, so promoter decision value remains unvalidated. Dining and brand probes returned cross-domain results; matched restaurant controls differed by signal. Brand recommendation responses exposed string keywords incompatible with the production parser; only the spike script adapts them. No production parser or UI changed. Across four capped/cached runs, 27 network starts and zero 429s were observed; no LLM calls or environment changes were needed. Do not commit generated Qloo reports/payloads.

The synthetic ALife experiment was independently reproduced via `npx tsx scripts/spike-alife-purpose.ts`: ten seed pairs, 600 residents, 52 weekly ticks, friend-choice bonus removed. Concentration changes split five positive/five negative, with near-zero mean; repeated seed-one report matched exactly. This is a model finding, not real-world behavioral validation. Reproducible scripts and source-backed spike reports are available; previous visual-test implementation plan stays on hold pending a chosen public promise. Update the architecture/README/pitch when that promise is approved; current application still reflects earlier directions.

## Product reassessment: pause feature expansion (2026-10-22)

The user challenged the event-planner problem statement and the retention of sandbox features. [Product brief](product-brief.md) records primary-source research, existing competitors and a conditional recommendation: test an evidence-backed audience-fit venue shortlist for independent music promoters before implementing more simulation UI. This is a hypothesis, not validated demand. Advanced experiments, automatic openings and user-facing fidelity have no demonstrated role in that proposed workflow; ALife should not be retained as decision authority merely because it is implemented.

The previous [visual-tests design](superpowers/specs/2026-10-22-planner-visual-tests-design.md) is on hold, including its proposed milestones. Do not execute it without revisiting this product decision. Current application behavior is unchanged. The next product checkpoint is a realistic sourced shortlist compared with practitioner research and a plain Qloo recommendation list, with explicit no-go criteria. Public evidence and competitor review are complete for this task; no practitioner validation, UI removal, new feature work or live forecast validation was performed.

## Walkthrough feedback review (2026-10-22)

Read-only implementation audit completed for numeric editing, venue camera focus, event completion, interview history, scene/background focus, rewind, capacity/fidelity semantics, scouting and AI request coordination. The user confirmed existing venues first with optional custom locations. Proposed direction: one Scout locations → compare → visual test → outcomes → schedule journey, with advanced ecosystem interventions secondary. The current architecture document's god-game goal is historical and conflicts with that proposed planner positioning; update it when the new direction is approved/implemented.

Concrete findings and acceptance criteria are in [planner visual tests design](superpowers/specs/2026-10-22-planner-visual-tests-design.md). This is a proposed design awaiting review, not a completed feature batch. Numeric empty-value coercion, pan-only camera targeting and the absent completion report/history are confirmed code-level causes. No application code, credentials, deployment or provider plan was changed in this review.

## Artist-first event planning, street names and provider limits (2026-10-21)

The primary workspace is now **Plan event**: artist and simulation date → Qloo-evidence venue shortlist → paired venue impact → explicit simulated scheduling. **Explore city** holds Venue directory, Scenes & crowds and City sandbox. Existing venue-first booking remains available. The shortlist includes open permanent music venues/clubs/bars/performance spaces with directed artist affinity; outside artists use their returned fan profile, without an invented proxy fallback. No evidence produces an empty result rather than arbitrary recommendations.

Comparisons expose usual host visits with and without the event, event attendance, combined totals and the observed three-seed turnout range. Snapshot and generation guards block stale comparisons and scheduling. The temporary event slot/capacity remains a model assumption, not a real venue reservation or validated ticket forecast. Automatic openings fill underserved scenes using catalogue taste templates; UI explanations and opening notifications now identify them as modeled openings. Manual placement also uses catalogue templates matched to area tastes.

Subtle screen-projected OSM street names preserve existing city geometry, align to roads, fade by zoom and suppress overlapping labels. London, Singapore and New York supplements are documented in `public/geo/README.md`; regenerate with `npx tsx scripts/build-street-names.ts`. No world rebuild or Qloo ingestion was needed.

Co-pilot requests use compact wire schemas (about 44% fewer schema characters), bounded response/tool rounds and context trimming at complete user turns. Provider Retry-After is propagated as a visible cooldown, with client/server gating. New chat clears context but preserves cooldown and the tool-execution ledger; duplicate tool-call IDs cannot replay city actions. The server cooldown is process-local, and character budgets approximate tokens. Provider account-wide limits remain; switching to a smaller model does not inherently bypass them.

Verification: 482 tests across 98 files, TypeScript, lint and a production build passed. Independent review found no important issue in the planner, paired accounting or co-pilot mitigation. Browser rehearsal selected Ghetts, shortlisted and compared three venues without advancing the live city, scheduled at Quaglino's and confirmed the Friday calendar entry. Six road labels were rendered in the inspected closer London view. One short live co-pilot question completed its city lookup and answered 2,500 residents without a 429; longer scenarios still need account-budget testing. The runbook and walkthrough explain the primary flow and model limits. Work is local on `feat/focused-city-interface`; no merge, push or deployment was performed. Plan: [artist-first planning](superpowers/plans/2026-10-21-artist-first-planning.md).

## Artist picker consistency (2026-10-21)

Follow-up: suggestions now use an absolutely positioned overlay anchored below the input, with a bounded scrollable list. They no longer add form height or move the date/Add controls. Browser measurements kept the start-week control at the same position with the list open and closed; Arrow/Enter selection and Escape dismissal were rechecked.

The booking planner's browser-native datalist is replaced with an app-styled editable combobox (`ArtistPicker.tsx`): dark scrollable results, violet keyboard highlights, filtered local artists, and exclusion of artists already in the lineup. Selecting a suggestion fills the field; Add retains the existing local/outside-artist path. Typing does not make Qloo calls. Arrow keys navigate, Enter selects an active suggestion, Escape dismisses only the suggestion list, and Tab/outside focus closes it. Results use an app-styled overlay anchored to the input, with their own bounded scrolling. Browser checks verified filtering, mouse/keyboard selection, adding a local artist and unmatched-name guidance without a new Qloo lookup.

## Stronger miniature-city art and live LLM check (2026-10-21)

The first venue-detail pass was visually too subtle. The renderer now applies the miniature-city style across the default overview: painted low-rise background buildings with separate pitched roofs, sparse warm windows, distinct roof palettes, chunkier venue silhouettes, blue-hour lighting, quieter streets and smaller scene-coloured resident markers. Background walls and roofs remain two instanced meshes, independent of building count. Simulation placement, agent behavior and world data are unchanged.

All venue kinds now have a deliberate architectural silhouette. Pitched roofs stay within existing pad footprints; unit tests walk the actual procedural model trees for every venue kind. Focus dims painted body/roof/trim as well as lights. Ghosts reuse the new shapes with their translucent materials. Geometry tests cover roof winding, finite normals and narrow-lot proportions.

After restarting with the user's locally supplied provider configuration, `/api/copilot` reported configured. A real co-pilot request called the city tool but hit Groq's token-per-minute limit on its continuation. A later short follow-up successfully reported the simulated resident count, and background naming produced named scenes. This confirms an accepted key and working short responses/naming, not unlimited capacity for multi-step questions. Provider 429s now get a clear wait-and-retry message without exposing raw account details. No key value or environment file was read, printed or committed.

Verification: 461 tests across 94 files and a production build passed. Independent review found a cafe sign inside its roof and painted surfaces bypassing focus dimming; both were corrected. Browser checks covered overview/readability, play/pause, scene naming/focus, map inspection, directory camera flight, closer zoom, and the roofed placement ghost with Escape cancellation. Plan: [stylized city](superpowers/plans/2026-10-21-stylized-city.md). The rendering change is local; no new world build, merge, push or deployment was performed.

## Focused venue interface (2026-10-21)

The main story is venue selection, act comparison and booking. Desktop and mobile now share one workspace drawer: **Venues**, **Scenes**, **City tools**, **Co-pilot**. The default map has no expanded sidebars. A searchable venue directory supports keyboard selection; temporary events and closed venues are excluded from its booking list. The existing map inspection path remains available.

Secondary information is progressively revealed: **City overview** has metrics/fidelity; **Playback** has speed/rewind; venue inspection has **Venue performance** and **Venue actions**; planning has **Schedule**. **City tools** groups place creation, events/scouting and neighbourhood changes. Placement clears the drawer and shows an explicit Cancel instruction. Navigation exits planning/scouting with the existing resume policy; stale comparisons still use snapshot guards. Escape closes the workspace or cancels placement, while an open playback/overview disclosure handles Escape locally.

`GET /api/copilot` returns only whether a supported provider key is configured, with no-store caching and no provider requests. Without configuration, the co-pilot drawer explains setup and points to manual booking. Background scene naming and interview entry points wait for known configuration. Configuration is not a provider health check; a valid key and successful live-provider rehearsal are still needed for the agentic demo. No credentials were added or changed.

A bounded procedural model pass gives clubs entrances/canopies, pubs roofs/windows/signs, cafes awnings/shopfronts, and music venues marquees/doors. Existing footprint limits, ghost previews, scene-colour signals and closure animation remain in use. Background buildings remain instanced; this is not a full scenery overhaul. Dining and fashion expansion remains deferred to preserve the focused story.

Plan: [focused interface](superpowers/plans/2026-10-21-focused-interface.md). Navigation instructions are maintained in the [runbook](pitch-and-demo.md) and [walkthrough](feature-walkthrough.md).

Verification: 456 tests across 91 files, lint, production build and `git diff --check` passed. Browser checks covered 375/768/1280px layouts, venue search/selection, existing-world act comparison, booking and calendar visibility, missing-key messaging, placement instructions, playback above a drawer, and Escape returning focus to navigation. The responsive fixture was temporary and removed. Independent review caught playback popover stacking and configured-chat focus/controlled-ID issues; both were fixed. No successful live-provider answer, new Qloo lookup, world rebuild, merge, push or deployment was performed in this pass.

## Submission and demo check (2026-10-21)

The [demo runbook](pitch-and-demo.md) now records the official submission requirements, schedule and scope assessment. A publicly hosted working app is required; a video is optional. No separate tracks or scheduled live pitch requirement were found in public organizer pages. The extended runbook needs about 5–6 minutes; an optional three-minute judge path is included. This check did not repeat a full browser rehearsal or implement new taste domains. Dining already has venue/tag support; brand ingestion and a dedicated fashion flow remain absent.

## Independent review fixes (2026-10-16)

All six findings reviewed at `894194f` are addressed on `codex/fix-review-findings`:
- Event forecasts preserve older reservations' calendar priority and report candidate start failures.
- Scout counts only the candidate's attendance and scenes, including the expiry tick when an automatic opening immediately reuses the slot.
- Planning closes with an explanation if the tick, epoch or host changes. Comparison and booking callbacks validate the current snapshot; edited/unmounted requests cannot restore old results.
- Outside-artist HTTP responses carry stable Qloo IDs. The browser resolves them against its own World, so old and newly built city worlds cannot mix numeric indices.
- Scene naming prunes discarded future lineages/cooldowns and ignores old-generation responses, while keeping ancestor names and ordinary playback debounce behavior.
- The operator console restores a persisted job's fixed budget and omits budget overrides on Continue/Retry; city selection is disabled while requests run.

Verification: `npm test` passed 452 tests across 89 files; `npm run lint`, `npm run build` and `git diff --check` passed. Synthetic regressions reproduce calendar competition, later/same-tick slot reuse, reordered World entities, immutable build budgets, missing hosts, rewind and naming-response races. Browser smoke check: local London act comparisons worked, then rewind safely closed planning; `/build-city` loaded and returned its expected disabled 503 without configuration. Local LLM naming also returned 503, so successful naming lifecycle behavior was checked with synthetic hook tests. No live Qloo build or production environment change was performed. The review fixes were subsequently merged into main and pushed; deployment status was not verified in the submission check.

Implementation checklist: [review fixes](superpowers/plans/2026-10-16-review-fixes.md).

## Deferred-features batch: done (2026-10-15)

Implemented by Codex ([plan](superpowers/plans/2026-10-14-deferred-features.md), [handoff](superpowers/plans/2026-10-14-deferred-features-handoff.md)) and finished, verified and committed by Claude.

- **Closure explanations:** natural, manual and event closures record their evidence (rolling weekly visits, rent-adjusted capacity, health, how long the venue was below the threshold). This shows in the venue panel, the toasts and the co-pilot. No speculative causes are given.
- **Scenes keep moving:**
  - opt-in residential moves, resident turnover and evidence-based scene splits (general defaults off; demo enables turnover and split checks, with residential moves off after the fidelity investigation below);
  - measured over seeds 7, 11 and 23 for 100 weeks: about 2,300 moves and more scene switching;
  - **no natural splits happened**, so the family tree stays mostly flat (see Next).
- **Dated bookings:**
  - start week and day plus exact nights, a snapshot-safe calendar and cancellation;
  - outside artists keep their own name;
  - the co-pilot gets `event_calendar`, dates and `cancel_event`.
- **On-demand city builds:**
  - an authenticated, resumable `/api/world-builds` with registry cities only, per-build budgets of 20–180, a 1,000-call reserve, private Blob checkpoints, CAS and leases;
  - plus **monthly quota reconciliation** (PATCH; builds block at month rollover until reconciled) and a minimal **`/build-city`** operator page.
  - Not configured in production (no `WORLD_BUILD_TOKEN`), so it's off there. See [on-demand-world-builds.md](on-demand-world-builds.md).
- **Fixes while finishing:**
  - a `runtime` route config that Next 16 rejects with `cacheComponents` (it would have broken the build);
  - mixed line endings in three new files;
  - "1 nights" wording.
- **Verified:** 439 tests, lint, production build and `git diff --check` all pass. In the browser on London: a dated one-night booking was compared, booked and shown on the calendar, then cancelled; an outside artist (Burna Boy) was booked and kept their name; the operator page answers with a clean 503 when builds are disabled. Not run live: a real build (it would spend quota and write to the production Blob store).

## Scene dynamics (investigated 2026-10-15)
- **On the real Qloo cities scenes do split, rarely.** London has 1–2 natural splits per 60-week run, around week 25; Singapore has 2–3 scene events per run; New York has almost none. The earlier "no natural splits" result came from the synthetic city.
- **Why splits are rare:** scenes are tight by construction. A typical member's taste matches its scene's average at about 0.91–0.93: shared starting tastes are reinforced every night out, and drifted tastes enter at half weight and decay. The split check only looks at members below 0.7 similarity, and there are almost none.
  - Averaging several atypical members into a candidate made no difference, so it was reverted.
  - Tripling drift or doubling decay changed nothing.
  - Making scenes genuinely more diverse would need a larger model change, such as venues' tastes drifting toward their crowds. That's deferred.
- **Residential moves lowered fidelity**, so they're now off in the demo. Mean of seeds 7, 11 and 23 at week 60:

  | City | With moves | Without |
  |---|---|---|
  | London | 0.15 | 0.22 |
  | Singapore | 0.06 | 0.11 |
  | New York | 0.22 | 0.31 |

  Turnover and the split check stay on, and still give 1–3 scene events per run.
- **Player actions can shake scenes up.** London, week 20, then 12 more weeks, over 3 seeds:
  - bringing in 300 newcomers of one scene gave a birth or split in 2 of 3 runs;
  - closing the 5 busiest venues of the biggest scene gave a split in 1 of 3;
  - doubling the rent on 30 central cells gave none.
- **Demo advice:** show change through player actions (newcomers, closures, events) and the scene card's size line. Don't promise natural splits.

**Phase:** M5b-2, M5e (with dates) and the deferred-features batch done; M7 shipping follow-up remains. Real Qloo worlds, booking, scene cards and family trees are implemented.

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
     - ~~Book for my venue~~: done (M5e).
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
- **Fidelity is held out:** one heatmap per scene seeds residents, and a different one is scored. London scores 0.17 → 0.20 and Singapore 0.04 → 0.12 over 60 weeks (as of M4; with turnover on and moves off, now about 0.22, 0.11 and New York 0.31 at week 60).
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

## M5b-2 (scene cards and tools): implemented
- Toolbar supports bringing in newcomers with a scene's tastes and raising rent around a map point.
- Pinned scenes show tastes, home neighbourhoods, tonight's venues, size history and parent/child links. The Scenes panel can show a family tree with faded ancestors.
- Reduced-motion preferences disable shockwaves, camera shakes and animated camera flights; controls have keyboard focus rings.
- Duplicate taste names are removed from scene cards. The desktop toolbar scrolls within a capped height to leave room for the co-pilot button.
- Fresh continuation checks: `npm test` (401 tests in 76 files), `npm run lint`, and `npm run build` all passed. These run the same scripts as the documented pnpm commands, which were unavailable in the continuation shell.
- Claude's handoff reports browser checks for newcomers, rent and toolbar clearance. The continuation verified automated checks; it did not independently repeat those browser checks.
- Scope: [milestone](superpowers/milestones/2026-10-14-m05b2-scene-cards-and-tools.md).

## Next
1. ~~The user re-adds `QLOO_API_KEY`~~: done.
2. M7 leftovers:
   - ~~GitHub homepage~~: set to the live URL.
   - ~~Phone layout~~: done. Below the `sm` breakpoint the top bar shows city, date and fidelity; a Tools · Scenes · Co-pilot tab row opens one full-width panel at a time; placing something closes the tools panel. Desktop is unchanged.
   - a demo-runbook rehearsal on the live site.
3. ~~Deferred-feature batch~~: done (see above).
4. ~~Scene splits~~: investigated (2026-10-15); see "Scene dynamics" below.
5. The user's UI overhaul, then final M7 polish: hosted demo rehearsal (including steps 4–5 in a visible tab), judge walkthrough and Devpost. A video is optional, not a submission requirement; prioritize the usable hosted app.

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
