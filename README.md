# Genus Loci

**Which venue would draw the biggest crowd for this artist? Race three Qloo-matched venues in parallel simulated futures and watch who wins.**

Pick an artist. Qloo's taste data shortlists the three existing venues whose crowds fit best. Each venue then hosts the artist in its own copy of the same simulated city, from the same moment and the same luck, night by night. The people who come glow in their venue's colour as they walk there, and the tallies climb. The result shows the winner, checks it against two more futures with different luck, and shows what the event did to the venue's usual nights and its neighbours.

Qloo supplies the venues, taste tags, artist affinities and geographic heatmaps. The residents, their nights out and the visit counts are simulation, not observed people or ticket sales.

**Public demo:** [Genus Loci](https://genusloci-culture-simulator.vercel.app/) · **Demo runbook:** [pitch and demo](docs/pitch-and-demo.md)

> Release note: the public URL still served an older interface on 2026-10-23. Publish this branch before submission. See [judging alignment and release checks](docs/judging-alignment.md).

## The experience

1. **Artist.** Pick a suggested artist or type any name. An artist the city doesn't know is looked up live in Qloo, and their fans' tastes stand in for them.
2. **Venues A, B, C.** The scout agent picks three of the best Qloo matches and says why; they appear on the map in three colours. Each venue's regulars glow in its colour and everyone else dims. Swap a venue, or choose the first night and how many nights.
3. **Race.** Each night, each venue's event visitors walk there, bright in its colour. Earlier nights' visitors stay faintly lit. Play, Pause and speed are yours.
4. **Result.** The result names who drew the most and whether it also won the other futures, with ranges. It also shows usual nights versus with the event, and visits taken from venues nearby.
5. **Tweak.** Click the step tabs (Artist, Venues, Race) to change anything and race again, or watch the same race again.

A scout agent picks the three venues to race. It looks the artist up in Qloo, checks the shortlisted venues' Qloo tags, and gives a one-line reason for each pick. When the race starts, it writes up why the winner won, from the race's numbers. It needs a language-model key (Gemini, then Groq). Without one, the race still runs, using the three best Qloo fits and no write-up.

## Why Qloo matters

| Qloo-derived input | Role in the model |
| --- | --- |
| Places, locations, kinds and taste tags | Venue catalogue, venue profiles and scene starting points |
| Artist recommendations and cultural affinities | Taste graph used in venue matching and adoption probabilities |
| Heatmaps | Geographic seeding; separate held-out maps support a limited spatial diagnostic |
| Artist affinities to venues | The A/B/C shortlist |
| Live artist lookup | Outside artists: who their fans also like, as the event's taste |
| Live search and tag-affinity tools | Grounded cultural lookups for the scout agent |

Removing Qloo would leave a functioning generic simulator, but remove the basis for its city-specific cultural relationships. Qloo provides cultural inputs; it does not validate the authored dynamics. We have not demonstrated superiority over an LLM-only baseline or real-world forecasting accuracy.

## Architecture

- **Simulation:** deterministic TypeScript in a Web Worker. Sparse tastes, outings, social exposure, drift/decay, venue health, scene clustering and lineage. The venue race steps a no-event baseline and one forked future per venue in lock-step from the same seed, so the race on screen is exactly future 1 of the forecast.
- **Guide:** Vercel AI SDK streaming with server-side Qloo tools; the browser sends the current race's numbers with each question.
- **Interface:** Next.js 16, React 19, React Three Fiber and Three.js. Real venue landmarks and OSM streets; residents walk to venues, coloured by the venue they chose.
- **Verification:** Vitest, ESLint and production TypeScript builds. Current task evidence and known limits live in [current state](docs/current-state.md).

## Run locally

Use Node 24 and pnpm 10.30.3.

```bash
pnpm install
cp .env.example .env.local
# Add QLOO_API_KEY to build a Qloo-grounded world.
# Optionally add GOOGLE_GENERATIVE_AI_API_KEY and/or GROQ_API_KEY for the scout agent.
pnpm build:world london
pnpm dev
```

Open localhost:3000. City builds write ignored `.cache/worlds/<city>.world.json`; they use live Qloo calls and cache matching requests. Costs depend on cache state and available signals. Other supported city slugs are `singapore` and `newyork` (see `src/geo/cities.ts` for the registry).

Without a built world or configured private world store, the app uses an explicitly identified synthetic fallback. That fallback is useful for setup/testing but does not demonstrate Qloo grounding. Without LLM credentials, the race works with the three best Qloo fits; only the agent's picks and write-up are missing. Provider configuration does not guarantee quota or availability.

```bash
pnpm test
pnpm lint
pnpm build
```

Externally hosted builds need the private world store configured and optional server-side provider credentials; see [.env.example](.env.example), [architecture](docs/architecture.md) and [world-build operations](docs/on-demand-world-builds.md). Never commit credentials, cached Qloo responses or built world files.

## Scope and evidence

The venue race compares simulated visits under authored rules and Qloo-derived inputs. It is not a ticket forecast, a check of real capacity or availability, or a validated planning tool. The three-future check shows how much luck matters within the model; it is not a calibrated confidence interval. Closures, rent, openings and resident interviews remain in the engine but are not part of the interface.

## Data and licences

- Code: [MIT](LICENSE), copyright Jethro Tan.
- Map data: [OpenStreetMap contributors](https://www.openstreetmap.org/copyright), ODbL; see `public/geo`.
- Cultural data: [Qloo](https://www.qloo.com), used under the applicable hackathon terms; raw response caches and generated worlds stay out of Git.

Built for the [Qloo Agentic Hackathon](https://qloo.devpost.com/). Submission copy: [Devpost draft](docs/devpost.md). Judge path: [pitch and demo](docs/pitch-and-demo.md).
