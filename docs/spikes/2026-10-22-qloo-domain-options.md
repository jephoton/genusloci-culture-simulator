# Qloo domain options: dining, fashion and a bounded ALife portfolio

<!-- generated: exploratory research, local source inspection and explicitly identified companion live probes; not an approved product pivot -->

### Matched restaurant control follow-up

Holding central London point, 5 km radius, resolved restaurant tag and `take=10` constant, no-signal, artist-conditioned and brand-conditioned queries each returned ten restaurants. Artist versus no-signal shared zero results; artist versus brand shared zero; brand versus no-signal shared one (Jaccard 1/19). Their top-three sets had no overlap. This establishes differentiated retrieval in these cases, not better recommendations, demand or commercial uplift. Brand recommendations also included non-fashion categories; `urn:entity:brand` is not a fashion-only filter. Total network starts for all root probes reached 27, not the earlier 25 recorded below; two matched-control calls were added, with other queries cached.

## Recommendation

Qloo can plausibly support more than music. Dining is the closest extension of this repository: restaurants and cafes already enter the world as places, and artist-to-place affinity already has historical API evidence. Fashion is plausible at **brand** level, particularly for site or partner research, but needs new coverage checks and a different user job. Neither supports apparel merchandising or commercial outcome prediction from the evidence available here.

Keep the [audience-fit product hypothesis](../product-brief.md) as the reference point. First test whether a small cross-domain shortlist changes a real research decision. Do not expand the simulation simply because the ontology permits more entity types. If the aim is a portfolio piece about artificial cultural life, explicitly choose that aim and evaluate the experience as a creative systems demonstration.

The authoring subtask used public official documentation and local source, made no live Qloo calls and read no credentials. A separate root-agent probe supplied the aggregate findings below; this document contains no returned payloads. Historical verification elsewhere means the findings already recorded in [qloo-notes.md](../qloo-notes.md), not a fresh reproduction.

## Companion live probe findings

The root agent reported 25 network starts across three passes, using a local cache, with no 429 responses. These aggregates extend the historical evidence; they are not a completeness or accuracy study:

- Three artist signals each returned 20 London places under the tested music-category filter, with affinities present. Some highly ranked results were potentially unbookable adult venues or a museum. Cultural affinity and broad category filtering did not establish booking feasibility.
- The first artist signal returned 10 restaurant candidates and 10 brand candidates. A search resolved one Uniqlo brand record; its signal returned 10 places, 15 tags, 10 brands and 1,800 local heatmap cells. An artist heatmap returned 1,723 cells. These counts establish non-empty responses for those combinations, not city-wide coverage, fashion-specific output, shopper counts or distinct local audiences.
- **Production parser limitation:** brand recommendation responses failed the existing entity parser because `properties.keywords` contained strings while the shared raw schema expects objects with `name` and optional `count`. A spike-only adapter in [the probe script](../../scripts/spike-product-data.ts) normalized keyword shapes, after which existing parsing succeeded. Production parsing remains unchanged. Do not present adapter success as current app support for those responses.
- Payloads and names remained in ignored local probe storage. This note records aggregates only. Matched geography/category controls and practitioner judgment are still required before concluding the dining or brand signal adds useful decision value.

Accordingly, “unverified” in the source-audit table below describes the prior historical/local-wrapper evidence. The companion run now establishes raw endpoint responses for the specific artist/Uniqlo combinations above, with a demonstrated brand parsing incompatibility. It does not verify arbitrary brands, nearby-brand ranking through `signal.location`, brand-reference filters or apparel items.

## What the domains actually mean

| Concept | Representation and practical implication |
| --- | --- |
| A restaurant or cafe at an address | `urn:entity:place`. Location and category filters can form a nearby shortlist. A chain's corporate brand and one restaurant branch are distinct records. |
| Fashion label or retailer | `urn:entity:brand`. Useful as an input interest or output recommendation if that entity has sufficient signal coverage. A brand has no implied storefront coordinates. |
| Clothing store at an address | A place, potentially connected to a brand. Resolving the label does not automatically identify every store or a suitable event space. |
| Shirt, collection, shoe size, inventory item | No apparel/product/SKU entity type appears in the official entity list or local whitelist. A brand recommendation cannot establish item availability, price, fit, stock, trend velocity or purchasing intent. |
| Cuisine, ambience, style or interest | A tag when present and resolved. Do not invent a URN from a human label or assume a fashion-style taxonomy exists because place/music taxonomies do. |

The official [entity categories](https://github.com/qloo/docs-public/blob/main/docs/entities.md) and [per-type parameter guide](https://github.com/qloo/docs-public/blob/main/reference/available-parameters-by-entity-type.md) support these distinctions. The guide documents place filters for hours, price, location and brand references; these are broader than this project's wrapper and still need target-server verification. Its brand section does not list location signals: the local wrapper accepting `near` for every type is not evidence that brand locality queries work on this account.

## What is already supported locally

| Operation | Local surface | Evidence status |
| --- | --- | --- |
| Name resolution and ID lookup | `search()` → `/search`; `entities()` → `/entities` | Historically exercised generally. Companion run resolved Uniqlo; arbitrary brand coverage remains unknown. |
| Nearby dining candidates | `places()` → `/v2/insights`, place type, WKT point/radius, optional tags and interest signals | Place location, genre filtering and artist-to-place requests historically worked. Restaurant-specific differentiation and useful coverage still need a probe. |
| Brands for an artist/place; places for a brand | `recommend("urn:entity:brand", …)` or `places({ signalEntities: … })` | Companion artist-to-brand and Uniqlo-to-place/brand requests returned results, with brand parsing requiring the spike adapter. Place-to-brand and arbitrary brand/type pairs remain unverified. |
| Taste descriptions | `tagAffinities()` and `searchTags()` | Historically exercised. Actual fashion tag families and coverage are unknown. Tags describe characteristics/associations, not a verified causal explanation for a ranking. |
| Geographic affinity | `heatmap()` with entity, tag or audience signals | Historically exercised for selected inputs; companion Uniqlo heatmap was non-empty. Coverage varies; some signals fail or yield thin results. |
| Budget, hours, specific candidate sets, brand-to-store constraint | Not exposed by `PlacesQuery`/`RecommendQuery` | Official documentation lists relevant filters such as `filter.price_level.max`, `filter.hours`, `filter.results.entities` and `filter.references_brand`. Adding or directly probing them requires separate verification; do not imply the app currently supports them. |

Source boundaries: [client](../../src/qloo/client.ts), [validator](../../src/qloo/validate.ts), [schemas](../../src/qloo/schemas.ts). The client accepts artist, book, brand, destination, movie, person, place, podcast, TV show and video game types. This is a transport capability, not ten complete product modes. Note a compatibility issue before generalizing: local validation spells the last URN `urn:entity:video_game`, while the current official Insights deep dive lists `urn:entity:videogame`; unrelated domain expansion should not silently treat every whitelist value as verified.

### Retained fields versus data assumptions

`QEntity` keeps ID, name, type, optional popularity/affinity/distance/location, tags and optional description. For places, it also keeps optional address, neighborhood, price level, rating, closed flag, live-music flag and keyword names/counts. A parser accepting an optional property does not establish that the requested city/entity actually returns it. Missing is unknown, not zero or false.

The public [Insights reference](https://github.com/qloo/docs-public/blob/main/reference/insights-api-deep-dive.md) and [restaurant recipes](https://github.com/qloo/docs-public/blob/main/recipes/recipes.md) describe richer filtering. The current schema drops fields such as hours, images, brand references and external links even if returned. This spike does not establish menus, dietary suitability, accessibility, admission rules, seating/standing capacity, event hire permission, availability or reservation slots. Those require independent verification or an appropriate source. Price level is not an exact meal price.

The world builder is narrower still:

- [Gathering](../../src/world/builder/gather.ts) queries places by kind, then artists for selected club/music/bar/gallery/other anchors. It does not gather brands, fashion stores or brand-to-place relationships.
- [Kind queries](../../src/world/builder/kinds.ts) already include restaurants and cafes. The `shop` query fetches record stores; a classifier recognizing `clothing_store` does not fetch clothing inventory.
- [Assembly](../../src/world/builder/assemble.ts) uses curated place/music tag families and artist edges; [world schema](../../src/world/schema.ts) allowing `brand` does not make brand assembly implemented. Place descriptions, factual operating details and request context are not preserved in its small entity representation. Capacity is generated from relative kind weights and a configured city total.

Consequently a dining research slice could use the Qloo client without rebuilding the simulated city. A fashion world would need a deliberate ingestion and representation design. Existing simulated visits, crowd genomes and geographic seeds are model constructions, not observed diners, shoppers or fans.

## Affinity is not attendance or purchasing

Qloo's [score interpretation](https://github.com/qloo/docs-public/blob/main/docs/interpreting-affinity-scores.md) describes relationships and contextual relevance, explains that small differences may be weak distinctions, and says scores are normalized per query. Compare ordering within a controlled query; do not average raw scores across unrelated requests or present a cross-query difference as business uplift. The guide uses a 0–100 presentation, while this repository documents 0–1 API affinities: confirm returned scale before display rather than copying thresholds.

There is no supported conversion from affinity to ticket sales, restaurant covers, shopping spend, store footfall or a popup's revenue. Likewise a taste heatmap is not a population count, a map of verified home addresses or a list of reachable customers. Historical project notes found substantial centrality correlation, making geography-only controls particularly important. An LLM can summarize supplied facts but cannot fill these missing operational and behavioral data.

## Three bounded use cases worth comparing

### 1. Music-and-dining companion shortlist

**User/job hypothesis:** a gig attendee or host arranging one evening knows the artist and show location and needs three plausible nearby dinner options to investigate before the show. Input: resolved artist, venue coordinates and explicit radius; optional user cuisine/budget constraints once verified. Output: a small restaurant shortlist with distance, returned attributes, cultural-fit ordering and facts requiring checking. No booking or opening-at-showtime claim.

This pairing is coherent at the level of one evening: music preference and nearby dining help the same person finish one plan. Qloo's [Michelin case](https://www.qloo.com/resources/client-stories/michelin-personalized-travel) describes cross-category restaurant/hotel personalization, showing a real adjacent job, but does not validate our concert companion. The case's commercial results belong to that deployment.

It is scope creep for the current independent-promoter venue job unless a promoter actually needs dining partners or guest hospitality. If retaining that customer, test a clearly named pre-show partner shortlist with a practitioner; do not quietly switch to a consumer itinerary product. A small list is sufficient; restaurant attendance simulation adds no demonstrated value.

**Bound:** one existing city, one artist, one radius, three options. Compare against distance/popularity alone. Continue only if intended users prefer and can explain useful differences after checking feasibility; stop if both lists are effectively interchangeable or facts are too sparse.

### 2. Fashion brand activation/site research

**User/job hypothesis:** a small brand's activation producer has a label or well-covered comparable label and three feasible locations/partners; they need audience-fit context to prioritize site visits or outreach. Output: a comparison of candidate places, returned descriptive tags, and unresolved operational checks. A new independent label may not resolve; a comparable brand is an explicitly chosen proxy, never represented as measured affinity to that new label.

Qloo's [Clarion case](https://www.qloo.com/resources/client-stories/clarion-magnificent-mile) describes an athleisure retailer location/co-tenant pitch. Its [jewelry case](https://www.qloo.com/resources/client-stories/jewelry-brand-radiant-growth) describes brand/customer research and store-placement support. These establish adjacent business decisions. **Popup activation is our extrapolation**, and neither case establishes which hackathon API operations or inputs reproduce its enterprise workflow.

**Bound:** one brand, one city and three independently feasible candidate sites; no apparel recommendation, sales forecast, rent optimization or full retail simulator. Validate entity resolution and cross-domain coverage first. Check rent, dates, permitted use, physical capacity, permits, brand compatibility and actual audience reach separately. A list of globally famous brands is not sufficient evidence of local fit. Stop if locality is unsupported or three candidates cannot be compared consistently; switch to a narrower partner-research question rather than inventing geographic precision.

### 3. Portfolio ALife: a legible cross-domain cultural ecosystem

**User/job:** a portfolio reviewer or curious visitor explores how a deliberately designed agent model evolves when different cultural preferences and places interact. This is a creative demonstration with an explicit purpose, not a professional planning product waiting to be discovered.

**Bound:** reuse one existing city; add one dining interaction layer before considering fashion. Show a small number of agents whose music and dining interests are distinguishable, one observable interaction, and an explanation of which inputs came from Qloo and which rules are authored. Brand tastes could later be non-spatial genes; do not turn a brand into a storefront or a simulated purchase by default. Existing architecture and rendering make this technically plausible, but no such new behavior has been implemented by this spike.

Judge success by whether viewers can explain the rule and observed emergence, whether runs are reproducible, and whether the piece communicates its limitations. Do not judge it by resemblance to Qloo heatmaps alone or claim that visual emergence proves real urban dynamics. Choose this route openly if demonstrating systems craft is more valuable to the user than validating a promoter tool.

## Recommended probes before an implementation decision

These are a request plan for a capped, separately authorized run, not performed results. Reuse resolved IDs/cache where available; use small `take` values, stop on invalid signals, and record aggregate coverage rather than payloads.

1. Resolve one widely covered fashion label through `search(query, { types: ["urn:entity:brand"], take: 3 })`; check intended brand/type and inspect field-presence counts. If ambiguous, do not use its ID as a signal. Resolve restaurant tags with `searchTags()` rather than guessing taxonomy.
2. Hold city point, radius, restaurant tag and take constant. Run nearby restaurants with no interest signal, with an existing artist signal, and with the verified brand signal. Record non-empty/invalid status, restaurant classification, distance compliance, retained field coverage, shortlist overlap and rank movement. Movement suggests differentiation, not correctness; inspect the candidates' plausibility.
3. If brand resolution succeeds, query `recommend("urn:entity:brand", { signalEntities: [knownPlaceId], take: 5 })` and, separately, artist-to-brand if budget permits. Check whether outputs are fashion at all. The wrapper lacks output tag filters on `recommend`; do not label generic brand output a fashion shortlist.
4. Only if necessary for the chosen job, use one brand `tagAffinities` or heatmap request. Record supported/invalid/empty and coverage, inspect centrality and do not infer shopper counts. Prefer this to another city build.
5. Defer `filter.references_brand`, hours/price and explicit candidate-set filtering to a second probe tranche only if the first results support a real decision. These require transport-level requests or wrapper changes and are not current UI features. Validate each combination against the target account; documentation alone is insufficient.

Do not probe apparel SKUs, full multi-city worlds or broad audience combinations. The next product checkpoint is choosing one of the three jobs and testing a concrete shortlist or legible ALife interaction, not adding every documented domain to the interface.
