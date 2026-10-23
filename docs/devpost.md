# Devpost write-up (draft)

<!-- generated: aligned with the current chat-first lab; review before publishing -->

**Name:** Genus Loci

**Tagline:** A Qloo-grounded cultural ecology lab: change a shared place and follow its simulated visitors.

**Demo:** https://genusloci-culture-simulator.vercel.app/

**Public source:** https://github.com/jephoton/genusloci-culture-simulator

**Release gate:** The public URL still showed the older sandbox UI when checked on 2026-10-23. Publish and rehearse the current branch before using this description in the submission. This note is for preparation, not submission copy.

## Inspiration

How do individual cultural tastes and shared meeting places produce a scene? A chat model can tell a plausible story about a club closing, but that story does not let a learner inspect the residents, repeat the experiment or change one condition and watch again.

Genus Loci turns that question into an inspectable artificial society. Its immediate audience is learners, educators demonstrating agent-based systems, and technically curious people exploring culture as an emergent process. It is an exploratory learning tool, not a validated decision system for promoters or city planners.

## What it does

The AI guide reads the current city, resolves venue names and uses simulation tools to prepare an experiment. The visitor explicitly applies a change and clicks Play. Recent visitors to the affected venue remain highlighted as they make subsequent outings. The visitor can inspect relevant venues, pause, read observed outcomes after completion, exit the view or rewind before a named change.

A single journey ties the interface together: question → inspect → prepare → apply → watch → outcomes → rewind. Closures, openings and rent pressure provide different questions within that same lab. They are interventions in an authored model, not announcements about real businesses.

A separate Plan an event entry restores artist-first exploration: choose an artist, shortlist culturally matching existing venues, compare alternative hosts against unchanged baselines and optionally schedule a modeled event. This makes artist/location comparison directly accessible without requiring conversational interpretation; affinity and simulated turnout do not establish real-world venue suitability or ticket demand.

## Why it is Qloo-powered

Qloo is used throughout world construction: place insights supply catalogue venues and their tags, artist recommendations contribute cultural relationships, and heatmaps seed the geographic distribution of taste profiles. Those inputs feed venue matching and affinity-weighted adoption in the simulated population. Separate held-out heatmaps provide a limited spatial diagnostic, not forecasting validation.

The guide also has server-side Qloo search and taste-analysis tools for grounded cultural questions. It uses the Vercel AI SDK to select tools and work from returned evidence, rather than invent venue identities or numerical outcomes. The simulation worker supplies the recorded results.

A generic simulator would still run without Qloo, but would not retain the same city-specific taste relationships. Qloo supplies the cultural grounding; the simulation's rules and parameters are our assumptions. We do not claim a measured win over an LLM-only baseline.

## How we built it

- Deterministic TypeScript simulation in a Web Worker, with sparse taste genomes, outings, exposure/adoption, drift, decay, venue health and discovered scenes.
- Snapshot rewind and fork for reproducible comparisons; multiple paired seeds for the underlying what-if calculation.
- A chat-first Next.js/React interface and React Three Fiber city, with real OSM streets, venue landmarks and a bounded recorded visitor cohort.
- Vercel AI SDK tool calling, Gemini-first/Groq-backup routing and deterministic command fallback. Explicit city mutations are validated locally and are not advertised as an autonomous AI action tool.
- Manual Play/Pause and explicit Exit case/view, with automatic stopping at a disclosed settling heuristic or observation limit.
- Cached, validated and budgeted Qloo access; generated Qloo worlds are excluded from the public repository and loaded through the hosted application.

## Challenges and lessons

Grounded data is different from validated dynamics. Qloo helps us model culturally meaningful relationships, but it does not tell us that our adoption rates, capacities or closure rules describe real people. We keep those boundaries visible.

A compelling visualisation also needs a question to follow. We narrowed the experience to one case at a time, followed recorded recent visitors, removed placeholder buildings and moved playback into the user's hands.

Provider failure cannot be allowed to duplicate a city change. Tool execution, explicit apply and fallback are separated; local commands remain available when AI is unavailable. The fallback has a bounded grammar and is not presented as equivalent to an LLM.

## What we learned

The useful promise is an experiment a learner can inspect and repeat, rather than a confident prediction about a real venue. Our strongest contribution is combining cultural data grounding, tool-using guidance and an artificial society whose behavior is visible and reproducible.

## What's next

Test whether learners can explain what changed, identify which assumptions produced it and distinguish Qloo evidence from model behavior. Then evaluate a controlled Qloo-grounded-versus-generic comparison, add resident taste/outing traces, and consider saved branches. No learner study, professional demand validation or real-world causal validation is claimed yet.
