# Devpost write-up (draft)

<!-- Draft for the submission form; edit freely. Numbers verified 2026-10-14. -->

**Name:** Genus Loci

**Tagline:** A living model of a city's culture, built from Qloo's taste graph, that you can poke and question.

**Live demo:** https://genusloci-culture-simulator.vercel.app
**Repo:** https://github.com/jephoton/genusloci-culture-simulator

## Inspiration

Cities lose their culture one venue at a time, and nobody sees it coming. A club closing, a rent rise or a new gallery isn't one business decision: it's a shock to an ecosystem of scenes. Ecologists model ecosystems. We wanted to model a city's taste the same way, with residents who carry real tastes, venues that compete for them, and scenes that emerge, split and die, so that venue owners, promoters and city culture teams could test a decision before making it.

## What it does

- **A real city, alive:** London, Singapore or New York, on real OpenStreetMap streets, with about 140 real venues from Qloo. 2,500 residents carry taste genomes made of real Qloo place tags and artists. Every night they go out, influence each other and form scenes, which get plain names generated from their tastes. Venues thrive or close depending on who comes.
- **God-game tools:** open a venue (the best-fitting real place for that spot), throw an event with a real artist, close a venue, and watch the effects ripple through the city.
- **Scout a location:** compare spots for a headliner. Each is simulated weeks ahead next to a no-event baseline over several seeded runs: turnout, new fans, and visits taken from neighbouring venues.
- **An AI co-pilot that experiments before it answers:** ask *"What happens if the busiest club closes?"*.
  - It reads the city and ranks the clubs.
  - It runs a **what-if**: four paired runs of the city with and without the change.
  - It answers with real venue names, visit shifts with ranges, and scene sizes, separating clear effects from ones too small to call.
  - Ask it to make the change and it does, live. It can also look things up in Qloo.
- **Interview a resident:** chat with a typical member of any scene. They speak only from their own simulated tastes ("give me a proper grime night with my mates, Wretch 32 or Ghetts on the lineup").

## How we built it

- **Qloo is the physics, not the labels.**
  - Venues come from place insights (one union-of-tags query per venue kind).
  - Residents' tastes and the affinity graph come from those venues' tags and from artist recommendations for each venue's crowd.
  - Where each scene's residents live comes from one Qloo heatmap per scene.
  - **Fidelity** is measured on a *different*, held-out heatmap per scene, and it rises as the simulation runs. After 60 simulated weeks (mean of three seeds) London scores about 0.22, Singapore 0.11 and New York 0.31, and all three climb from where they start. The scores are modest, but honest and falsifiable.
- **Simulation:** deterministic TypeScript in a Web Worker.
  - Daily ticks cover outings, exposure, adoption along Qloo affinities, drift, decay and venue health.
  - Scenes are tracked with warm-started spherical k-means and lineages.
  - It supports exact rewind and forking, which is what makes what-ifs and scouting possible.
- **Rendering:** a React Three Fiber night diorama, with crowds walking the real street graph and post-processed shockwaves, beacons and ripples for openings, closures and events.
- **Agents:** the Vercel AI SDK, provider-agnostic (DeepSeek V4 Flash primary, with fallbacks through Groq, Cerebras, OpenRouter and Gemini). The co-pilot's city tools run *in the browser* against the simulation worker; its Qloo tools run on the server, capped per question.
- **Stack:** Next.js 16, React 19, Three.js, zod, Vitest (about 380 tests). Deployed on Vercel; city worlds live in a private Blob store, because Qloo data stays out of the public repo.

## Challenges

- **Calibration honesty.** Seeding residents from venue locations scored almost no fidelity, because Qloo heatmaps mostly track how central an area is. We switched to seeding from one heatmap and validating on another, rather than fitting to the score.
- **Noise.** A single simulated future can't tell an effect from chance. Paired seeded runs and a "too small to call" verdict made the co-pilot's claims trustworthy.
- **A 10,000-call monthly quota.** Every Qloo call is validated, throttled and cached, including known-bad requests. A city costs about 60–80 calls to build, and rebuilds are free.
- **Silent API failures.** Invalid Qloo parameters return an empty 200, and many venues can't act as signals for some target types. The client validates inputs, flags suspicious empty results and caches "invalid signal" answers.

## What we learned

Grounding matters more than eloquence. The co-pilot became useful when every claim was backed by a what-if against a baseline, and when it said plainly what it couldn't tell.

## What's next

- Any city, on demand, with a progress screen and a quota guard.
- "Book for my venue": compare acts and nights for a specific venue.
- Specimen cards and a scene family tree.
- Averaging scenes across runs for even steadier answers.
