# Product and ALife spikes

For free LLM options and the bounded live Groq tool-schema probe, see [provider evaluation](2026-10-22-llm-provider-options.md). Gemini is the next candidate to test; its live results remain pending local credentials.

The user subsequently chose a chat-first lab entry. See [chat/agentic requirement findings](2026-10-22-chat-agent-requirements.md) and the [implemented walkthrough](../chat-lab-walkthrough.md). Supported commands execute locally; optional AI adds language flexibility. The finite parser is not an unrestricted LLM replacement.

<!-- generated: bounded findings, not an implementation commitment -->

The user explicitly values keeping the ALife work as an interesting portfolio project, even without a commercially validated use case or hackathon win. This changes the evaluation: usefulness can mean teaching, experimentation and demonstrating systems craft. Do not force a business claim to justify retaining the simulation.

| Route | Evidence from this spike | Recommendation |
| --- | --- | --- |
| Promoter venue scouting | Three worked artist briefs; direct affinity differentiates results but does not ensure a suitable performance venue. No practitioner validation. | Keep as a small research hypothesis, not the app's asserted purpose. |
| Music plus dining | Artist-conditioned restaurants returned data and differed from same-scope no-signal results. | Most natural cross-domain data slice; useful for a one-evening consumer plan or a deliberate cultural-model experiment, which are different jobs. |
| Fashion/brand site research | Brand resolution, brand-to-place, brand tags and heatmap returned data; brand recommendation needed a spike-only parser adapter. | Plausible separate research mode. No apparel inventory, storefront, purchase or sales claim. Do not add it as a new persona to the promoter interface. |
| Playable cultural ecology lab | Existing mechanisms, deterministic forks/rewind and a reproduced ten-seed ablation support inspectable computational experiments. | Strongest recommendation for the user's stated portfolio goal. Explicitly explanatory and experimental, not a digital twin or commercial forecast. |

Read the [promoter findings](2026-10-22-promoter-scouting.md), [Qloo domain audit](2026-10-22-qloo-domain-options.md), and [ALife purpose/experiment](2026-10-22-alife-purpose.md).

## Recommended portfolio narrative

**Genus Loci is a playable laboratory for exploring how tastes spread through shared places.** Qloo supplies cultural relationships; residents, learning rules, social links and venue ecology are an authored agent model. A visitor asks a question, inspects the relevant agents/venues, runs a controlled change, and compares outcomes and uncertainty within that model.

Useful questions to investigate include whether repeated shared-place exposure reinforces existing groups or creates crossover, whether curiosity changes diversity, and how loss of a meeting place changes participation. These are hypotheses to measure, not guaranteed dramatic effects. The ten-seed friend-choice ablation found no consistent directional concentration change; report negative results instead of tuning until the story looks dramatic.

Keep the public experience to a few guided experiments with one visible question and a legible result. Avoid a kitchen-sink Advanced experiments menu. The first candidate is a **learning enabled versus frozen tastes** comparison with resident taste traces, measured turnover/diversity and clear parameter differences. It would demonstrate consequences of authored learning rules; it would not validate those rules for real humans. No such UI or new experiment was implemented in this spike.

Dining can become a second bounded model layer only after the core learning loop is understandable. Brands could be non-spatial tastes; a fashion brand must not automatically become a store or a purchase. Do not simultaneously build a gig planner, restaurant concierge, retail consultant and research lab.

## What was delivered

- Three Qloo-derived local scouting briefs and matched restaurant probes, kept in ignored storage.
- Two reproducible CLI scripts: `npx tsx scripts/spike-product-data.ts` (requires Qloo, bounded/cached) and `npx tsx scripts/spike-alife-purpose.ts` (synthetic, no API).
- Domain capability findings, prototype parsing workaround and a source-backed evaluation of three simulation purposes.
- A recommendation and next evidence checkpoint. No application UI, simulator rules, credentials, paid plans, merges, pushes or deployments were changed.

## Next checkpoint

Choose the public promise explicitly. If portfolio ALife is primary, continue with one guided, measured and reproducible experiment; validate that a viewer can explain the mechanism and result. If commercial scouting is primary, test the worked brief with actual promoters before building more features. Both routes reuse work, but they require different claims and success criteria.
