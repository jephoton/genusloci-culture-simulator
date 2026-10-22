# Focused event scouting and visual tests

<!-- generated: proposed design, awaiting user review; not implemented -->

**On hold:** subsequent problem reassessment challenged this workflow's usefulness. Read [product brief](../../product-brief.md) before planning implementation. The milestones below are historical proposals, not approved work.

## Product decision

Help an event planner who already has an artist choose a location, understand the simulated audience and local effects, and compare alternatives before scheduling. The user confirmed existing venues first, with optional custom map locations. The city is the explanation surface for that decision. The ecosystem remains the simulation engine; rent, migration and venue creation are secondary experiments, not steps in the planner journey.

Options considered: patch each current workspace independently (smallest change, retains fragmented flow); unify scouting and planning with focused visual tests (recommended); remove the ecosystem entirely (loses cultural feedback and existing capabilities). Preserve existing engine features behind an Advanced experiments disclosure while keeping the planner surface narrow.

## Verified findings

- `EventPlanner` coerces the input on every keystroke with `Number(value)`, so an empty edit becomes zero. This affects nights and start week.
- Venue preview points to a cell. `CameraDirector` explicitly preserves camera distance, so it pans without zooming. Several venues may share a cell.
- `finishEvents` records completion but no attendance/outcome summary. Frame attendance is per tick and event slots can be reused.
- Focus supports a scene or venue; decorative `Buildings` does not receive focus. Interviews discard the resident ID after converting their profile to prose persona data. Resident profiles expose only latest attendance, not visit history.
- Fidelity is mean Spearman rank correlation of simulated home-cell taste strength against Qloo heatmaps across populated cells. It is not attendance accuracy.
- Capacity is a relative model value by kind/popularity, blended with baseline simulated visits. The UI's effective capacity multiplies it by rent, representing the weekly visits needed for model health, not physical seats or admission enforcement.
- Rewind restores an earlier snapshot and replays actions exactly. The earliest initial snapshot is retained (normally tick zero). Rewind discards the later future and pending actions; session history is not durable across a reload/city reset.
- Existing Scout ranks demand-selected cells/custom pins for a temporary event. Plan event ranks existing hosts by affinity, then compares the same artist/date at those hosts. Both use the paired event engine, but expose different assumptions and defaults.
- Co-pilot compaction/cooldown exists. Naming and interviews have separate request paths and do not participate in a shared provider scheduler.

## Main journey

1. **Scout locations:** artist, simulation date and nights; existing venues by default. Keep raw numeric input as editable text, allow empty while editing, parse and validate on submit. Explain valid ranges inline; do not silently replace an empty value with zero. Numeric keyboard support; consistent behavior in the secondary booking/scouting forms.
2. **Compare locations:** shortlist evidence plus modeled results. Existing venue is the default candidate type; optional custom location is explicitly a hypothetical temporary event with no verified venue/permissions. Use the same date, duration and scenario assumptions across candidates. Preserve artist/date state when switching candidate mode.
3. **Locate selected venue:** target its actual rendered landmark position, frame it at a useful bounded distance, account for the open drawer, and show a brief named beacon. Respect reduced motion and manual camera control. The selected host remains marked after the beacon fades.
4. **Run visual test:** pause and retain the source city, then play an isolated event scenario paired with a no-event baseline. Clearly label Test mode and dates, provide stop/return, and restore the original city when leaving. The test must not schedule into the source timeline. Scheduling remains an explicit separate action.
5. **Review outcomes:** pause automatically at the end of the event, including its final attendance tick. Show cumulative visits (and unique simulated attendees separately), host usual visits, neighboring venue changes and new artist followers, with the comparison window and assumptions visible. A single visual test is one paired realization; retain the existing three-run estimate/range separately. Do not present that range as a calibrated confidence interval.
6. **Schedule:** explicitly commit the selected scenario to the live simulation calendar. Track its observed completion and offer an observed-results summary. Only report causal differences when a valid matched baseline was retained; otherwise label observed values and do not subtract an old forecast as though it were a counterfactual.

## Evidence and visual focus

Use one focus context for selected host, test, scene, resident or co-pilot result. It contains stable evidence references and an explanation of what is highlighted. Store IDs/lifetime identity, not only recyclable event slots. Clear focus on reset, city change, rewind, cancellation and replacement; reject stale async results.

During a test, highlight event attendees, host and nearby venues with measured visit differences. Distinguish attendance from counterfactual differences. A Show audience / Show venue effects control chooses the layer; a small legend says what to watch. Never imply every highlighted participant was causally changed by the event. Determine membership from worker evidence, not LLM prose.

Dim nonselected residents, venues, decorative buildings and roofs. Reduce decorative building height/visual density by default, using subdued low-rise massing to retain map orientation. Their windows/lighting must not compete with real venue landmarks. Focused objects need a clear outline/halo and readable marker, not brightness alone. Support reduced motion and retain roads/labels as orientation cues.

For interviews, preserve the selected resident ID and show their marker, home area and latest modeled outing route. Record bounded recent visit history (28 simulated days) to support an honestly labeled Recent visits / Most visited in recorded window panel. No invented favorites, historic routes or real individual tracking. Use street-based modeled paths where available; otherwise label the connection schematic. A replaced resident does not inherit their predecessor's history.

For co-pilot results, offer Show on map from structured city-tool evidence (venues, scenes, scenario differences). Do not infer entity identity from generated text. Cache evidence with city/epoch/tick identity; stale results remain readable but cannot falsely highlight current occupants of reused slots.

## Attention and model honesty

Move routine scene births/venue changes to a collapsed activity log. Main-surface notices are limited to the current operation's failure, requested action confirmation and test completion; prefer persistent inline state within the current workspace. Do not discard important errors. Keep broader activity accessible on demand.

Rename Fidelity to Spatial taste alignment in model details. Explain -1 to 1 correlation, zero meaning no monotonic alignment, undefined cases and missing heatmaps. Never render 0.22 as 22% accurate. It does not validate ticket demand, causal forecasts or venue viability.

Rename Effective capacity to Model weekly visit target (rent-adjusted), show its unit and provenance. Real seating/admission capacity remains unknown unless separately sourced. Do not rescale theatre values to plausible seat counts without data; that changes the simulation and confuses units.

In planner tests, suppress automatic venue openings so the tested event has an understandable operating environment, and disclose that assumption. Keep the broader venue ecology in Advanced experiments. Any template opening there must use a hypothetical display name distinct from the real catalogue business, with source-profile provenance available. The current matching algorithm is taste-based, but its name/location is not a forecast of a real opening.

## LLM budget and graceful fallback

Coordinate naming, interview and co-pilot calls through a server-side per-provider/model request budget and cooldown; prioritize explicit user requests over background naming. Disable automatic scene naming by default in planner mode, with cached/deterministic numeric scene labels available. Deduplicate/cache naming and grounded summary requests. Keep tools selected for the requested task and pass bounded relevant evidence instead of broad city history; preserve runtime validation and tool-call deduplication.

Read rate-limit headers without logging secrets or provider account details. Expose concise retry guidance and request type. A cooldown cannot guarantee admission while another app/process uses the same provider account. A process-local scheduler must be described as such; multi-instance deployment needs shared coordination or conservative limits. Do not transparently repeat a city-changing action while retrying an LLM response.

If measured request demand still exceeds the account allowance, the operational choices are a provider/model with a verified sufficient allowance, a higher account quota, or reduced AI usage. Do not promise a new key/smaller model bypasses account limits. Do not change credentials, paid plans or deployment automatically. Core scouting, visual tests and summaries use deterministic simulation data and remain usable without an LLM.

## Relative implementation sequence and acceptance

- M0: editable numeric fields, precise selection/zoom/beacon, stronger focus and reduced decorative massing. Verify clearing/retyping, keyboard use, same-cell venues, drawer visibility and reduced motion.
- M1 after M0: unified Scout locations journey, shared artist/date/candidate state and quiet activity log. Hide advanced interventions from primary navigation; update pitch/runbook around one planner persona.
- M2 after M1: isolated paired visual test and worker-generated outcome evidence, auto-pause, retained source state, explicit scheduling. Verify final-tick accounting, cumulative/unique counts, slot reuse, cancellations, start failure, rewind/reset and no mutation of source state. Scheduled observed reports must not masquerade as causal comparisons.
- M3 after M2: resident recent-history routes and structured co-pilot evidence focus. Verify empty history, resident replacement, cross-city references and stale epochs.
- M4 after M1: shared AI request coordination, task-specific context and usage measurements. Verify 429 headers, shared cooldown, priority, cancellation, duplicate tool calls and manual fallback. Rehearse the complete journey without any LLM key.

The source-code audit and external input/rate-limit guidance support this proposal. No implementation or successful live-provider capacity rehearsal is claimed by this document.

References: [numeric inputs](https://service-manual.ons.gov.uk/design-system/patterns/numeric-values), [Groq rate limits](https://console.groq.com/docs/rate-limits).
