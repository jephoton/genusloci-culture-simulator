# Evaluate comparison as the main workspace

<!-- generated: evaluation requested 2026-10-23; recommendation, not approval to replace the current main view -->

## Recommendation

Yes: the artist/alternative-venue comparison is a stronger candidate for the primary task workspace than the current post-apply case view. Retain the case renderer as a Watch this option drill-down rather than deleting it. The useful change is the hierarchy: comparison answers the question; focused playback explains the selected scenario.

This is not a recommendation to promise ticket forecasts or validated professional planning. Current audience and judging materials describe an exploratory cultural lab. A practitioner-facing main promise would need separate audience/suitability validation.

## Why the comparison feels more useful

It begins with a concrete brief: an artist and an event window. It produces a small candidate set, uses the same brief at each host, and shows an explicit no-event baseline. A visitor can understand what to compare and what a different choice changes.

The current case view begins after a change is applied. Its target, cohort and progress are visible, but it does not inherently present an alternative or a baseline. Closing a venue then reporting zero target visits is true but often uninformative; cohort outings are observations, not isolated impact. The interesting ALife machinery can therefore look like movement without answering a user's question.

## Side-by-side assessment

| Dimension | Artist/host comparison | Current focused case |
| --- | --- | --- |
| Starting question | Which existing host is the better cultural fit for this artist under the model? | What happens after I apply this intervention? |
| Required input | Artist, candidate hosts and an event window | Validated intervention and live state |
| Output structure | Several alternatives with the same brief; baseline/scenario figures | One followed target/cohort and subsequent actual model activity |
| Isolated model change | Paired seeded no-event/event futures and host accounting | Post-application observations only; not a causal difference |
| Reversibility before acting | Comparison leaves the live city unchanged | Applied changes require rewind to undo |
| Legibility | Explicit cards, selected host, baseline table and seeded range | Strong spatial focus but weaker explanation of why the movement matters |
| Qloo's contribution | Artist-conditioned venue shortlist and fan profile are direct | Cultural inputs act through authored dynamics; provenance is less immediately visible |
| ALife value | Simulation supports the comparison, but can feel like an opaque score | Shows resident movement and emergent system behavior directly |
| Main risk | Taste match may suggest an unsuitable venue; simulated visits can be mistaken for sales | Activity/highlights can be mistaken for a measured causal effect or broad impact coverage |

## Evidence in the implementation

- `src/ui/event-planning.ts` ranks at most three open permanent hosts from directed Qloo affinity edges or an outside artist's returned profile. It filters music venues/clubs/bars/other; that does not certify physical event suitability. It refuses absent evidence instead of fabricating a match.
- `src/ui/EventPlanner.tsx` holds one artist/date brief and compares all shortlisted hosts. Its impact table separates event visits, usual host visits, and host-plus-event totals, with a three-seed turnout range. The range is not a calibrated confidence interval.
- `src/sim/booking.ts` and `events.ts` share the paired event-run machinery and preserve host/no-event accounting. They compare the same authored model, not real-world causal outcomes.
- `src/sim/case.ts` follows recorded visitor slots and tracked venues after application. It stops on an activity heuristic or cap and does not run a live no-change twin.
- `src/ui/case-summary.ts` correctly discloses that its observed counts exclude the application step and are not a paired causal estimate. That honesty also limits its usefulness as the main comparative answer.

This is an implementation/product evaluation, not a user preference study or a measured completion-time experiment. The separate planner has been restored and browser-rehearsed; replacing the whole main workspace is not implemented by this evaluation.

## Proposed hierarchy if approved

1. Main workspace: **Compare options**, with an artist brief and two or three candidate cards. Present cultural fit and model differences with clear units; do not invent a real booking recommendation.
2. Select an option: show the host/event baseline table, repeated-run range and relevant map locations. Chat explains this same evidence and can help refine the brief.
3. **Watch this option**: enter the existing focused map playback for the selected scenario. The distinction between a forked preview and explicitly applying to the live city must be visible; the current user's approved live-city mode still requires explicit apply.
4. After playback: return to the comparison with a clearly labelled observation report. Keep predicted paired-run results separate from the actual selected live trajectory.
5. Keep closures/openings/rent as secondary model experiments. Their results would need their own baseline/alternative adapters; they cannot simply be relabelled as artist comparisons.

The design makes the comparative evidence the primary answer and the simulation a way to inspect it. It reuses both systems rather than replacing the simulation engine.

## Work needed before making it primary

- Connect a selected comparison scenario to focused playback, carrying the same artist, host, date, duration, resolved profile and snapshot identity. Current scheduling alone is not this bridge.
- Preserve the explicit apply/manual Play/Pause/Exit semantics. A preview must not silently alter the live city, and a live application must not be labelled as an unchanged preview.
- Decide how to handle a scheduled event beyond the observation cap: observe its relevant window or disclose the limit, rather than stopping before the event.
- Make candidate selection obvious on the map and allow return to comparison without discarding the brief. Pause/rewind must invalidate stale results consistently.
- Keep turnout/host change/uncertainty visible instead of the internal composite `score`; do not call a model score real-world success probability.
- Verify distinct scenarios: a weak artist match, no affinity evidence, tied alternatives, unsuitable-looking catalogue categories, provider failure, stale timeline and a real scheduled event completing.

## Relative checkpoints

- **C1:** restore and rehearse the existing planner as a separate entry (completed locally).
- **C2:** approve the comparison-first hierarchy and implement the selected-option-to-case bridge.
- **C3:** test whether a fresh visitor can choose a candidate, explain its baseline difference and distinguish modeled evidence from a real forecast.
- **C4:** only then make comparison the default main workspace and move broader case experiments behind it.

No calendar estimate is assigned. C1 confirms the existing comparison components can be reused; the selected-option playback bridge remains separate work.
