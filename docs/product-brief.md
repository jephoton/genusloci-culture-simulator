# Product reassessment: audience-fit scouting

<!-- generated: research-backed recommendation, not validated product demand or an approved implementation plan -->

**Follow-up:** the user subsequently authorized the [three spikes](spikes/README.md) and explicitly accepted ALife portfolio/research value as an independent goal. Their findings favor a playable cultural ecology lab for that goal. The promoter hypothesis below remains unvalidated; do not treat it as the chosen direction merely because it was documented first.

## Decision

Conditional go for a small audience-fit research prototype; no-go for further ecosystem/visual-test expansion until its decision value is demonstrated. The previous proposed visual-tests design is on hold. Do not preserve rent changes, migration, openings/closures or general scenario controls in an Advanced experiments product menu merely because they exist.

The current project is a substantial technical base with no demonstrated user outcome. Better animations, interviews and simulated outcome reports cannot establish a useful or accurate planning recommendation. Existing implementation and historic pitch describe a cultural ecosystem sandbox; that is different from solving a promoter's venue-research problem.

## Specific user and job hypothesis

An independent music promoter has an artist and is considering a show in an unfamiliar city or neighborhood. They need to prioritize which feasible venues to investigate or contact, with an audience-fit rationale they can challenge. They are not asking to manage a simulated city. This is a narrower hypothesis than all event planners, and still requires practitioner validation.

Problem statement: **I know the act, but do not know the local scene well enough to judge which feasible venues are culturally plausible. Help me compare candidates and identify what to verify before I approach them.**

The claim is research support and prioritization, not predicted ticket sales, verified availability, a bookable venue recommendation or guaranteed commercial success.

## Evidence and its limits

- The UK Parliament Culture, Media and Sport Committee's [grassroots music venues report](https://publications.parliament.uk/pa/cm5804/cmselect/cmcumeds/527/report.html), published 11 May 2024, describes promoters bringing venue and artist together, paying guarantees/renting venues and underwriting ticket sales. This establishes an economically consequential role; it does not validate our proposed audience-fit tool or a simulation of attendance.
- [Chartmetric's live-events product](https://chartmetric.com/use-cases/live-events-venues) offers artist live histories, venue capacity/location/history, genre mix and market discovery. [Its audience analytics](https://support.chartmetric.com/en/articles/186) addresses geographic fan concentration. Basic venue discovery and artist-location analytics are not unmet categories.
- [Bandsintown for Artists](https://help.artists.bandsintown.com/en/articles/7048877-analytics-insights) offers follower locations, show requests and event views/RSVPs/ticket clicks. [Venue insights](https://help.venues.bandsintown.com/en/articles/8487034-insights) reports event/promotion engagement. Existing alternatives have observed signals our simulation lacks.
- [Qloo capabilities](https://www.qloo.com/capabilities) describe cross-domain taste and locality intelligence. This supports a possible data ingredient, not verified small-promoter demand, neighborhood attendance probabilities or a competitive advantage.
- No practitioner interviews, usage study, venue-shortlist outcome study or ticket-sales validation have been completed in this reassessment. Public evidence supports the broader decision problem; the specific gap remains an inference.

## Alternatives considered

1. Predict turnout or profitability: an important decision, but currently unsupported. We lack calibrated conversion, actual ticket sales, real capacities, prices/costs, marketing reach, competing events and venue availability. Reject as the product promise.
2. Explain audience fit among feasible locations: more compatible with Qloo and current place/artist data. Recommend a narrow test, with limitations and provenance visible. Do not claim this is unique or market validated.
3. Culture-policy ecosystem simulator: closer to the original technical concept but a different customer and job. Causal closures/rent/scene claims would require validation, too. Do not introduce this as a second persona to rescue existing features.

## Smallest useful outcome

Input: artist, city/search area, optional realistic size/type/budget requirements, and optionally the promoter's existing candidate venues. Artist coverage and place resolution must be checked. Missing data must be explicit; never infer real seats, hire costs or availability from model parameters.

Output: a concise comparison of up to three venue candidates with (a) available Qloo affinity evidence and its direction/provenance, (b) relevant shared artists/tastes when actually present in returned data, (c) sourced place facts and coverage gaps, (d) weaknesses/uncertainty, and (e) what the promoter should verify next. User-supplied hard constraints are separate from cultural fit. Insufficient evidence yields an incomplete assessment, not a low-fit verdict or invented rationale.

The user leaves with a ranked investigation/contact shortlist and a saveable brief, not just a score or an animated city. Show which candidates are feasible from verified/user-supplied constraints versus still unverified. Do not send outreach without explicit authorization.

The map answers where candidates are and allows evidence inspection. Add neighborhood affinity only at the geographic resolution supported by available Qloo responses. Do not present simulated residents as observed fans, residence locations, ticket buyers or a reachable marketing audience. Date must not alter the evidence ranking unless actual date-specific evidence is integrated; avoid asking for inputs that imply unsupported capabilities.

## What leaves the user flow

- No Advanced experiments menu: remove manual rent/migration/open/close controls from the proposed planner product.
- No automatic new openings/closures in the decision workflow. They do not establish whether the user's event will succeed.
- No user-facing fidelity statistic; retain computeFidelity only as an internal modeling diagnostic. It is not recommendation confidence or business accuracy.
- No effective-capacity numbers pretending to be real seats.
- No simulated resident interviews, routine ecosystem toasts, or mandatory Play/rewind before obtaining a result.
- No attendance counts as the recommendation's authority. ALife/paired simulation is not required for this first-value test; park it as research code. Retain a visualization only if it explains an evidenced relationship better than a simpler map/list.

Do not delete engine code or alter current product behavior as part of this research task. Removal here describes the recommended future product scope.

## Why now, ideal version and MVP

The enabling ingredient is taste/place inference from Qloo, not newly proven market demand. The ideal version combines trustworthy audience affinity, actual venue constraints, availability, past comparable shows and real results. The MVP tests only whether a sourced audience-fit brief improves a shortlist, using existing evidence and explicit unknowns; no new data integrations are assumed.

## Validation checkpoint before more engineering

Use three real recent/upcoming booking-research cases from independent promoters, not only famous artists at obvious venues. Have each practitioner first describe their actual process, candidate venues, information sources and decision criteria without showing the app. Ask where time was spent, what was missing and what would change a decision; do not ask only whether they like the idea.

Produce the proposed brief using existing data, even manually. Compare it against the practitioner's baseline research and a plain Qloo recommendation list. Check whether it adds a defensible candidate, identifies a useful mismatch or reduces research work. Record coverage failures and incorrect recommendations; a lack of evidence is an important result.

Directional go: practitioners can identify concrete, decision-relevant value in at least two of the three cases and explain the evidence behind it. This is a lightweight discovery checkpoint, not statistical validation. No-go: recommendations are obvious, unsupported or mostly irrelevant compared with constraints/cost/availability. If no-go, stop expanding the planner narrative; reconsider the use case instead of adding simulation features.

Useful later metrics: time to an actionable shortlist, share of recommendations judged relevant by practitioners, evidence completeness, corrections/overrides and repeat use on another booking. Simulated turnout and fidelity are not success metrics for this job.

## Next step

Review this narrowed hypothesis and test a sample brief for a realistic artist/city/candidate set. No new feature implementation, provider billing change, data publication or external messaging is authorized by this brief.
