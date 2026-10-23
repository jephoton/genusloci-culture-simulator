# Genus Loci — current pitch and judge runbook

<!-- generated: describes the current implementation, not the older public sandbox -->

## Pitch

Genus Loci helps a learner explore how shared places and cultural tastes can produce collective patterns. A generic chat answer can tell a plausible story about losing a club; this lab lets the visitor inspect a culturally grounded model, change the venue, follow its recent visitors and repeat the experiment.

Qloo supplies the catalogue places, taste relationships, artist affinities and heatmaps. A tool-using AI guide helps inspect and prepare cases; a deterministic engine records the outcomes. The visitor explicitly applies changes and controls playback. The residents and dynamics are simulated, not measured real people or validated business forecasts.

The restored artist planner provides another concrete experiment: start with an artist, inspect an affinity-based venue shortlist, and compare the same artist at alternative hosts against unchanged baselines. That is cultural-fit exploration under model assumptions, not a booking recommendation verified for suitability, capacity or ticket demand.

**Audience:** learners, educators and technically curious people exploring agent-based cultural systems. Practical use by promoters remains a hypothesis, not validated demand.

**One-line explanation:** Ask about culture, inspect the model, change one thing and follow what its simulated visitors do next.

## Why this needs Qloo

- Place metadata and tags establish culturally meaningful venues and profiles.
- Artist recommendations and affinity edges shape venue matching and adoption probabilities.
- Heatmaps seed taste geography; different held-out maps provide a limited spatial diagnostic.
- Live Qloo search/taste tools let the AI guide consult cultural evidence beyond the built city.

The simulator can run with synthetic data, but that is explicitly labelled as a fallback and loses the same city-specific cultural grounding. Authored rules are not Qloo predictions. We have not measured superiority against a generic LLM-only baseline.

## Demo runbook (allow 5–6 minutes)

Before rehearsal, use the externally published build of this branch. On 2026-10-23 the existing public URL still served the older sandbox; local success is not production verification.

1. **Orient.** Select London. The welcome should identify a Qloo-grounded world, not synthetic fallback. Explain that venue data/relationships are sourced while residents and behavior are simulated.
2. **Warm the city.** Click bottom Play, allow a few outings, then click Pause. The chatbot describes these controls rather than operating them.
3. **Ground an answer.** Ask “What's the busiest club?” Inspect its name, health and distinct recent visitors. The ranking is recorded model activity; bright people are recent visitors rather than an entire taste scene. If the top result is tied, use a named venue from the list.
4. **Show the agent.** With AI guide enabled, ask a hypothetical closure using that full venue name. The guide should inspect/resolve the city and prepare a comparison through tools, not invent IDs or outcomes. Do not call the deterministic fallback itself an autonomous agent. Use local supported wording if providers fail and explain the distinction.
5. **Apply and watch.** Say “apply that”. The validated change is applied once, the case stays paused, and the visitor clicks Play. Follow highlighted recent visitors and their destinations. Only relevant venues can be selected during the case. Click Pause for inspection and Play to continue.
6. **Read outcomes.** At settling or the cap, playback stops after the final outing animation. Explain tracked visits, followed-group outings and model health. The report excludes the application step and is not a paired causal estimate or proof all consequences ended.
7. **Try another hypothesis.** Rewind before the named change through History & speed, or click Exit case/view to leave the focus while keeping changes. A new valid intervention can replace a case; it remains paused until Play.
8. **Show cultural fit.** Open the separate Plan an event entry. Pick a local artist, find the venue shortlist and compare alternatives. Show usual host visits and host-plus-event totals with/without the event and the seeded range. Explain that affinity does not establish practical venue suitability. Existing artists do not need a new Qloo lookup; outside artists require live Qloo. Scheduling is explicit and leaves the city paused.

For a short rehearsal, use steps 1–7 and one prepared planner comparison. There is no required video length: the current overview requires a usable hosted application, and says a video is not required.

## Honest answers to likely questions

| Question | Answer |
| --- | --- |
| Who benefits? | Learners can inspect and repeat a cultural model instead of taking generated stories on trust. Educational usefulness has not been tested in a learner study. |
| What is agentic? | The AI guide uses Vercel AI SDK tool calling to select inspections, comparisons and Qloo lookups; validated local code owns mutation. The ALife population alone is not the agent-framework argument. |
| What if the LLM fails? | Gemini → Groq → bounded local commands. Do not claim all paraphrases or autonomous planning still work. |
| Why can venue colours change? | Signs follow current crowds; body/beacon hues follow the closest live taste scene. Scene centroids evolve while venue profiles remain fixed. |
| Does it predict a real closure's effects? | No. It records behavior under authored assumptions and Qloo-derived inputs. No causal field validation or ticket-sales forecasting is claimed. |
| Is it a finished commercial planner? | No. The artist comparison demonstrates a practical exploratory question; professional adoption and event suitability remain unvalidated. |
| Why not add fashion/dining now? | The rules do not require every taste domain. A coherent music/place story is more demonstrable than unintegrated extra domains. |

## Submission and access

[Official overview](https://qloo.devpost.com/) and [rules](https://qloo.devpost.com/rules), checked 2026-10-23: publish a working external demo, public source with detectable open-source licence, and a matching text description. The four criteria are equally weighted. The deadline is 31 October 2026, 11:45 am Singapore time (30 October, 11:45 pm EDT). Recheck announcements before submitting; the overview now says the top three finalists will appear on air on 5 November and need availability/preparation.

Keep judge access free and unrestricted through the published judging period. Current rules list judging through 5 November Eastern time; the older November 16 note was obsolete. Submission and finalist participation remain the user's actions. See [judging alignment](judging-alignment.md) for checked facts and outstanding gates.

## Release checklist

- Publish the current branch; then verify the public URL shows both chat and the restored planner, manual playback and no placeholder buildings.
- Confirm a Qloo world loads, with no private-login requirement or accidental synthetic fallback.
- Rehearse one real AI tool round and one fallback path on the deployed environment. Configured credentials are not evidence of provider health.
- Complete an applied case, a rewind and an artist/host comparison on the public URL. Confirm scheduling stays paused if demonstrated.
- Use the public MIT repository link and the updated Devpost draft; keep source, description and hosted UI consistent.
- Resolve the installed Next.js security advisories and reverify the patched build before publishing; see the alignment audit. No dependency upgrade was performed in the narrative/planner pass.
- No raw Qloo cache/world files, credentials or secret-bearing logs in Git or submission artifacts.
