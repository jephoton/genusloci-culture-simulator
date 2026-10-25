# Promoter audience-fit spike

<!-- generated: executed API/data spike; not practitioner validation -->

## Question and result

Can Qloo provide differentiated artist-to-venue evidence for a useful promoter scouting brief? **Yes for data differentiation; not yet for a trustworthy recommendation.** Three London examples produced distinct affinity-ranked candidate lists, but some leading candidates had inappropriate or unverified performance formats. The current venue-category union is too broad to establish suitability for a live concert.

No promoter was interviewed. These are analyst-selected artist cases, not three real promoter booking cases. They establish technical coverage and expose failures; they do not satisfy the practitioner checkpoint in [the product brief](../product-brief.md).

## Executed probe

Run `npx tsx scripts/spike-product-data.ts` from the repository root with existing local Qloo configuration. The script loads configuration without printing credentials, uses the existing ignored cache, stops below a monthly reserve of at least 1,000 requests, permits at most 30 network starts per invocation, uses no retries and applies request timeouts. Reruns should use cached responses. The cap is per invocation, not a shared cross-process budget.

Inputs were analyst-selected Ghetts, Nilufer Yanya and Yaeji, with exact normalized-name resolution and no substituted first search result. Scope was a 5 km circle around central London, wider than the demo world's 1.5 km radius. Do not compare these results with the app's existing shortlist as though coverage and query design were the same.

Resolve live-music category URNs using tag search. Hold point, radius, category union and `take=20` constant for an unconditioned music-place baseline and three artist-conditioned requests. The category union includes nightclub and returned live-music venue/bar variants; it is a permissive place filter, not a concert-space certificate.

All three artists resolved. Each returned 20 places with affinity fields, and each top-three set shared zero entities with the music-category baseline's top three. Nine of nine candidate entries had coordinates; six of nine had a true live-music field and three had no such field. There is no useful inference that missing means false, or that true means this act can be booked there.

## Worked briefs and review

The script generated three local briefs, each listing three candidates with direct affinity provenance, available address/category details, field gaps and verification questions. Qloo-derived names, IDs, scores and results remain only in ignored `.cache/spikes/product-direction/` files. The private report is `scouting-briefs.md`; `private-results.json` contains the parsed evidence. Do not commit or publish those files.

Spot checks of candidate official websites found adult-entertainment positioning and museum positioning among returned results, alongside an actual live-music venue. Relevant independent references: [nightlife operator](https://fyeo-london.co.uk/club/), [another nightlife operator](https://www.rhinowindmill.com/events/), [museum](https://handelhendrix.org/), [live-music operator](https://www.theoldbluelast.com/). These pages establish business/performance context, not whether the act could ever play there or whether the specific date is available. No blanket exclusion of unconventional venues is implied; they require explicit format/permission evidence.

The differentiation is real as a response behavior. Decision usefulness remains uncertain: a returned affinity is not evidence of artist draw, ticket conversion, financial viability, venue hire permission, real capacity, availability, accessibility or production suitability. Generic operational tags also appeared prominently, so simply displaying the first few tags is a weak explanation. Tags must not be described as the causal reasons for an affinity score without evidence.

## Compare against simpler alternatives

- **Unconditioned place/category list:** the artist signal changes candidates, so the API contributes more than a static popularity list.
- **Direct Qloo artist-to-place request:** this already returns the core ranking. The proposed app adds no demonstrated value by running an unvalidated simulation after it.
- **Promoter's feasible shortlist:** not tested. This is the more promising boundary: let the practitioner supply or confirm suitable candidates, then add cultural evidence and clear unknowns rather than claiming the highest-affinity places are ready to book.
- **Existing-world graph ranking:** narrower and indirectly assembled from venue-to-artist discovery. This probe queried artist-to-place directly; do not assume affinity direction, normalization, coverage or ranking agrees with the world graph.

## Go/no-go

Continue only as an evidence brief prototype, with explicit feasibility checks and a comparison against a practitioner's baseline. Stop claiming event-success forecasting. No-go for implementing the previous elaborate visual rehearsal on the strength of these three API examples alone.

For the user's newly stated portfolio goal, the cultural-ecology laboratory is independently legitimate and does not need the promoter brief as a commercial wrapper. Keep the two evaluations separate.

## Verification and limitations

Across the initial live run, a diagnostic pass, brand-adapter verification and matched dining controls, 27 network requests were started in total, with no 429 responses. These calls include the companion dining/fashion spike; they are not 27 promoter cases. The original run used 21 starts; each follow-up used two, with other queries served from cache. No LLM calls, city rebuild, environment changes, deployment or application behavior changes were made.

This script tests the integration using real queries, not automated correctness of recommendations. Follow-up checks run TypeScript/ESLint on the spike scripts. No new dependency is required.
