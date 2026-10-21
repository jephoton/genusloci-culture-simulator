# Artist-first event planning and map orientation

**User direction:** The planner starts with an artist and needs a venue. Prioritize a connected path over simulation controls: artist/date → evidence-based venue shortlist → paired event impact → explicit scheduling. Keep exploration available as secondary navigation. Do not present simulation venue openings as predictions about named real businesses.

**Plan:**
- Add a Qloo-affinity venue shortlist using the artist's actual edges/profile, open permanent hosts only, and no fabricated match when affinity evidence is absent.
- Extend event outcomes with observed baseline/with-event location visits and three-run turnout ranges. Preserve existing score and hostChange semantics. Test paired-run accounting and non-mutation.
- Add a single artist-first planning drawer with explicit stages, consistent snapshot/date guards, before/after review, and scheduling confirmation. Route secondary tools through Explore city. Core flow requires no LLM.
- Preserve real OSM road names and render subtle collision-limited labels without changing the existing geometry or rebuilding Qloo Worlds. Parallel worker owns labels and data.
- Reduce LLM context/schema repetition, retain current tool pairs and explicit mutation authorization, add rate cooldown/reset UX. Parallel worker owns agent mitigation; no account/secret/provider changes.
- Explain the venue-opening rule in UI and docs: catalogue profile/name selected by unmet scene demand; modeled opening is not a real-world business forecast. Manual creation uses the selected venue kind and local taste fit.
- Browser-rehearse the primary artist-first path and labels; review integrated changes, run tests/lint/build, and update handoff/runbook. Keep changes local on the existing feature branch.

**Acceptance:** A first-time user can name an artist, identify candidate venues, see this event's change from a no-event baseline for the same period, and deliberately schedule it. Results state simulation limits and uncertainty; no requirement to drive the city or chat to the co-pilot first. Provider limits are mitigated, never claimed to be bypassed.
