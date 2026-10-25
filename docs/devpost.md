# Devpost write-up (draft)

<!-- generated: aligned with the venue race (M8); review before publishing -->

**Name:** Genus Loci

**Tagline:** Which venue would draw the biggest crowd for this artist? Race three Qloo-matched venues in parallel simulated futures and watch.

**Demo:** https://genusloci-culture-simulator.vercel.app/

**Public source:** https://github.com/jephoton/genusloci-culture-simulator

**Release gate:** The public URL still showed an older UI when checked on 2026-10-23. Publish and rehearse this branch before using this description. This note is for preparation, not submission copy.

## Inspiration

Where should an artist play? A chat model can name venues that sound right, but it can't show you who would actually turn up, or why one room beats another. Culture is made by people and places together: a venue draws its crowd from who lives nearby and what they like. We wanted to watch that happen, using real cultural data.

## What it does

Pick an artist. Qloo's taste data shortlists the three existing venues in the city whose crowds fit best: A, B and C, each in its own colour, with their regulars glowing on the map. Then they race. Each venue hosts the artist in its own copy of the same simulated city, from the same moment and the same luck, night by night. Each night the people who go walk to their venue in its colour, and the tallies climb.

The result names who drew the most and checks the winner against two more futures with different luck. It also shows the range of visits, the venue's usual nights versus with the event, and how many visits it took from venues nearby. Change the venues, the first night, the number of nights or the artist, and race again. An optional guide explains the result from the race's numbers and can consult Qloo.

Artists the city doesn't know are looked up live in Qloo: who their fans also like becomes the event's taste.

## Why it is Qloo-powered

Qloo is used throughout. Place insights supply the venues and their tags. Artist recommendations build the taste graph, and the A/B/C shortlist ranks venues by Qloo affinity to the artist. Heatmaps seed where each taste lives, which decides who is within reach of each venue. A separate held-out heatmap gives a limited spatial check, not forecasting validation.

Outside artists use live Qloo calls (search, recommendations and tag affinities). The guide has server-side Qloo search and taste tools through the Vercel AI SDK, and answers from the race's own numbers rather than inventing outcomes.

A generic simulator would still run without Qloo, but would not retain the same city-specific taste relationships. Qloo supplies the cultural grounding; the simulation's rules and parameters are our assumptions. We do not claim a measured win over an LLM-only baseline.

## How we built it

- A deterministic TypeScript simulation in a Web Worker covers sparse taste genomes, nights out, exposure and adoption, drift, decay, venue health and discovered scenes.
- The venue race steps a no-event baseline and one forked future per venue in lock-step from the same seed. The race on screen is exactly future 1 of the three-future forecast, which a test checks.
- The city is a React Three Fiber scene with real OpenStreetMap streets and Qloo venue landmarks. Residents walk the streets to their venue, coloured by the venue they chose.
- The Vercel AI SDK powers the guide, with Gemini first and Groq as backup, plus server-side Qloo tools.
- Qloo access is cached, validated and budgeted. Generated Qloo worlds stay out of the public repository and are served privately.

## Challenges and lessons

**Grounded data is not validated dynamics.** Qloo tells us which tastes and places go together. It doesn't tell us that our adoption rates or venue capacities describe real people, so we keep that line visible.

**A good simulation still needs a question.** Earlier versions let you close venues, raise rents, book events and chat about it all at once. None of it added up to a story. We cut it to one question, one flow and one picture: three colours of people walking to three venues.

**Making people visible.** Each venue draws only a handful of simulated people a night, so they looked like any other dot. Bigger, glowing, venue-coloured people, everyone else dimmed, and earlier nights kept faintly lit made the crowds readable.

## What we learned

A watchable comparison beats a pile of tools. Running the same city three times with one difference, and showing the difference as people, explains more than any score.

## What's next

Add real venue constraints (capacity, availability) next to cultural fit. Then test with promoters whether the race helps them shortlist venues, and compare it with a generic LLM's suggestions. No user study or real-world validation has been done yet.
