# Genus Loci — Glossary, Pitch and Demo Runbook

> **Current rehearsal:** use [Chat-first lab walkthrough](chat-lab-walkthrough.md). The promise is an inspectable cultural ecology learning lab, not validated promoter forecasts. Demonstrate lookup (including recorded recent visitors) → prepared comparison → explicit apply → focused live playback → automatic pause and observed outcomes → named checkpoint rewind or resume. Keep bottom playback visible; inspect a highlighted venue's name/model health. Beacon/body hues show the closest live taste scene; signs show the current crowd. Venue tastes stay fixed. **Exit case/view** releases focus and pauses; a valid new intervention can replace an observation while retaining earlier applied changes. There are no main-surface numbered weeks. Questions try Gemini Flash-Lite → Groq → deterministic parsing; explicit changes/playback stay local. Include local mode with AI disabled. The older timed venue-planner/sandbox sequence below is historical reference.

<!-- generated: maintained by agents; keep in sync as plans land -->

> **Status (2026-10-14):** London and Singapore run on **real Qloo data** (M4). Venues, artists, tastes and heatmaps all come from Qloo; the World files are built with `pnpm build:world <city>` and served by the app, never committed. The synthetic city is only a fallback. **M6 agents are live:** the co-pilot answers questions and runs what-if scenarios, scenes get field-guide names from their Qloo tastes, and you can interview a resident of any scene.

## Glossary

### Real concepts (they stay in the product)

| Term | Meaning | Source |
|---|---|---|
| **Entity** | Anything Qloo knows: an artist, a place (bar, club, restaurant), a brand, a film, a book… | Qloo catalogue (over 250M entities) |
| **Taste** | What one person loves, each with a strength. Called the agent's *genome* in code. | Seeded from their neighbourhood's scenes: real Qloo place tags and artists |
| **Affinity** | How strongly loving one entity predicts loving another ("people who love X also love Y"), from 0 to 1 | Qloo taste graph |
| **Tag** | A named category on an entity: genre (pop, techno), cuisine, style, vibe | Qloo entity metadata |
| **Venue** | A real place on the map that people go out to. It has a type, a capacity and health. Painted architecture distinguishes kinds; subtle lighting carries its scene identity, and the neon sign shows tonight's dominant crowd. | Qloo place entity |
| **Artist** | A musician. Appears in tastes, and as the headliner of an event. | Qloo artist entity |
| **Tick** | One simulated day in the demo (`ticksPerWeek: 7`). Each day residents decide whether to go out, weighted towards Friday and Saturday. Venue health uses a rolling week of visits. | Simulation |
| **Resident (agent)** | One simulated person: a home, a taste, friends. Goes out most weeks. | Simulation |
| **Scene** | A group of residents with similar taste, discovered by the simulation rather than defined. Scenes are born, grow, split, merge and die; the family tree tracks this. | Emerges from the simulation |
| **Archetype** | A starting taste profile, found by clustering the city's real venues by their Qloo tags and the artists their crowds like. Each neighbourhood's mix comes from a Qloo heatmap of that taste. | Qloo places, tags, artist recommendations, heatmaps |
| **Niche** | A scene with many people but few suitable venues. Large niches auto-open a venue. | Simulation |
| **Fidelity** | How closely the simulated city's tastes match where those tastes really live (rank correlation, −1 to 1), measured on **held-out** Qloo heatmaps that the seeding never saw | Qloo heatmaps |
| **Heatmap** | Qloo's answer to "where in this city does the taste for X live?": an affinity score per map square (geohash) | Qloo Insights (`urn:heatmap`) |

### Placeholders that disappear with real data

- **Cluster:** six invented "taste clusters" (fake genres) used by the synthetic stand-in, hence names like "Cluster 0 Venue 1".
- **Synthville:** the synthetic fallback city.
- **Scene names:** an LLM names each scene once, from its real Qloo tastes and home neighbourhood: a short plain name, e.g. "Grime friend groups". "Scene N" shows until the name arrives.
- **What-if:** the co-pilot's experiment. It forks the city twice, one copy with the change and one without, runs both for N weeks, and compares them. The live city is untouched.
- **Resident interview:** chat with a typical member of a scene. They speak only from their own simulated tastes.

### How it works

Every week, residents go out to a venue that suits their taste. There they're exposed to the venue's taste and the crowd's, and they adopt new things in proportion to Qloo affinities. Tastes drift, scenes form and evolve, and venues thrive or close depending on whether anyone comes.

### How Qloo data is used

| Qloo data | Used for | Status |
|---|---|---|
| Places (location, kind, tags) | Real venues on the map, their landmark kind, and their taste | **Live** (M4) |
| Artist recommendations for a venue's crowd | Artists in residents' tastes and as event headliners; venue–artist and artist–artist affinities | **Live** (M4) |
| Tags (place vibes, music genres) | Taste genes, the venue–tag and tag–tag affinities that drive adoption and drift; scene names | **Live** (M4, M6) |
| Search and taste analysis (live, in the co-pilot) | Explaining what a taste means, or looking up something outside the city | **Live** (M6), capped per question |
| Heatmaps | Seeding where each scene's residents live (one per scene), and the Fidelity check (a different, held-out one per scene) | **Live** (M4) |
| Audiences | Not used yet | — |

## Pitch

**The hackathon's ask:** agents are culturally blind; build the thing that only works because it knows what people love.

> Cities lose their culture one venue at a time, and nobody can see it coming. A venue closing, a rent rise or a new club isn't just one business: it's a shock to an ecosystem of scenes. **Genus Loci** grows a living model of a real city's culture from Qloo's taste graph. Thousands of residents carry real tastes, go out to real venues and influence each other. Venues, promoters and city culture teams can test a decision before making it: *"What happens to this scene if this venue closes? Where is the scene going next? What's this neighbourhood missing?"* An AI co-pilot runs the scenarios and explains the results in plain English.

- **Why it needs Qloo:** without the taste graph, the simulation has no physics. Venue choice, adoption and scene drift all come from Qloo affinities, and held-out heatmaps provide a limited spatial taste check.
- **Who it's for:** independent venues (survival), promoters (where scenes are heading, and where to put an event), city night-time-economy teams (venue-closure policy).
- **Tagline:** *Every city's culture is a living species.*

### Hackathon alignment (checked 2026-10-21)

- The [official requirements](https://qloo.devpost.com/) require a working, publicly hosted app, a public source repository with an open-source license, and a description explaining Qloo's role. **A demo video is optional.** A local server is for rehearsal, not the submitted demo link.
- No separate tracks or scheduled live pitch/demo-day requirement were found in the public overview, [rules](https://qloo.devpost.com/rules), [resources](https://qloo.devpost.com/resources) or [updates](https://qloo.devpost.com/updates). Recheck organizer announcements before submission.
- The four equally weighted judging criteria are technology implementation, design, potential impact and quality of the idea. Position the product as a venue/promoter decision co-pilot: compare acts for a venue, scout locations, and explain scenario differences. Make that useful flow visible before exploring the simulation's broader features.
- The [schedule](https://qloo.devpost.com/details/dates) sets the deadline at October 30, 2026, 11:45 pm EDT (October 31, 11:45 am Singapore time). Keep judge access free and unrestricted through the end of judging, November 16, 11:45 pm EST (November 17, 12:45 pm Singapore time).
- Scout and **Plan a night here** both exist. Closure explanations now show recorded simulation evidence; they do not establish real-world causes. Held-out heatmap fidelity is a limited spatial taste check, not validation of causal business forecasts.

### Dining and fashion scope

- **Dining has a foundation:** the builder gathers restaurants and cafes and retains eligible cuisine/culinary-style tags. A bounded extension could surface those tastes and compare restaurant concepts or a post-gig dining fit using the existing scenario machinery. This dedicated workflow has not been implemented or validated.
- **Fashion needs data work:** the schema supports brands, but the builder currently gathers artist recommendations, not brand affinities; shop gathering targets record stores. A small, real-Qloo brand-affinity overlay could be explored after checking coverage. Do not present brand taste as an existing feature.
- Avoid adding full dining and retail activity loops before submission: they need new behavioral assumptions, calibration and flows. The current outing model does not independently simulate meals and shopping. One coherent decision flow matters more than covering every example domain.

## Demo runbook (allow 5–6 minutes)

The timed steps below total 4 minutes 35 seconds, excluding setup and response waits. This is a rehearsal guide, not an organizer-mandated live presentation.

For a shorter, optional three-minute judge walkthrough: introduce the Qloo-backed city (20 s), highlight one scene and its tastes (25 s), use **Plan event** to match a headliner, compare venues and schedule one (45 s), show a co-pilot what-if against its baseline (65 s), then explain fidelity and model limits (25 s). Response latency may extend this; rehearse on the hosted app.

For a full hands-on tour of every feature (about 30 minutes, with a checklist), see [feature-walkthrough.md](feature-walkthrough.md).

**Focused interface:** start with **Plan event**. **Explore city** contains **Venue directory**, **Scenes & crowds**, and **City sandbox**; older Venues/Scenes/City tools references below mean these submenus. Co-pilot is separate. Statistics/fidelity are in **City overview**; speed/rewind are in **Playback**. The calendar is above the directory when no venue is selected.

**Primary rehearsal (about 90 seconds):** keep London paused; choose **Ghetts** and a future Friday in **Plan event → Find matching venues**. Explain that the shortlist ranks Qloo taste evidence. **Compare impact at 3 venues**, choose a card, and show the **No event / With event** table and three-run turnout range. Only **Schedule in the simulation** commits the event; **View event calendar** confirms it. This is the promoter's main story: one artist, a venue choice and an isolated modeled event effect. Real availability, ticket demand and causal business forecasts are not established. The wider ecosystem walkthrough below is optional after this decision.

**Rate limits:** compact schemas, bounded responses/history and a visible cooldown reduce provider load. **New chat** reduces old context without resetting limits or city changes. The primary planning rehearsal works without an LLM for existing-world artists; outside artists separately need Qloo.

**No LLM key:** rehearse the manual path: **Venues → choose venue → Plan a night here → Compare → Book**, then Play and explore Scenes. Existing-world artist comparisons need no LLM; outside artists separately need Qloo. Skip the co-pilot, scene naming and resident interview steps until a supported provider is configured and the server restarted. The offline drawer explains this; it does not simulate an AI answer. The agentic submission still needs a working provider for its conversational demonstration.

*(today)* marks what works now.

0. **Setup:** load the demo city (London, or NYC for US judges), paused at week 0, with the default camera.
1. **Hook (20 s):** "This is London tonight. Every dot is a resident with real taste from Qloo; every lit landmark is a real venue." Press **Play** at 1 day/s (½ if the room needs it to be slower). Crowds stream out along real streets, gather at venues and walk home. *(today)*
2. **Scenes emerge (30 s):** "Nobody told it what scenes exist. They emerge." Open **Scenes**, hover a row to highlight a scene's people and venues, then click to fly there. *(today; plain names require an LLM provider)*
3. **The check (15 s):** open **City overview** and point at **Fidelity**, then close the overview. Residents were seeded from one set of Qloo heatmaps; fidelity checks them against *different* Qloo heatmaps, and it rises as the city runs (after 60 weeks: London about 0.22, New York 0.31, Singapore 0.11). Be honest that it's modest: a limited spatial taste check, not proof of causal forecasting. *(today)*
4. **The shock (40 s):** select the venue at the heart of the biggest scene, then **Venue actions → Close venue**. You see the implosion and the regulars scattering; the venue panel says why it closed. Play a few weeks: open **Scenes** and watch the scene card's size line, struggling venues pulsing red nearby, and possibly a venue auto-opening in the gap. Don't promise a split: natural splits are rare (see current-state, "Scene dynamics"). *(today)*
5. **The what-if (40 s):** open **Playback → Rewind** and move the slider to before the intervention. Close Playback. Instead, **City tools → Open a place → Open a venue** nearby: pick a kind, watch the ghost preview, place it. Compare how the scene develops without promising a particular outcome. "Two futures, one decision apart." *(today)*
6. **The promoter (40 s):** "You're a promoter. Where should this headliner play?" Open **City tools → Events and scouting → Scout a location** and pick the headliner.
   - The city pauses, an amber demand glow shows where their fans live, and pins A–C appear.
   - The tool simulates 4 weeks at each spot and ranks them on turnout, new fans, scenes reached and harm to neighbours.
   - Drop your own pin D to compare, then **Book it**: shockwave, beacon, and the crowd converges. *(today)*
6b. **The venue owner (30 s):** select a venue, then **Plan a night here**. Add an artist the city doesn't know (for example Burna Boy in London): Qloo is asked live who their fans are. **Compare** ranks the acts by turnout and by what each does to *your own* usual nights. *(today)*
7. **The co-pilot (30 s, requires an LLM):** open **Co-pilot** and pick *"What happens if the busiest club closes?"*. It reads the city, ranks the clubs, runs an 8-week what-if against a no-change baseline (repeated 4 times with different random seeds), and answers with real venue names, visit shifts with ranges and scene sizes, separating clear effects from ones too small to call. Then ask it to *"close it in the live city"* to watch it act. *(today)*
8. **Meet a resident (20 s, requires an LLM):** open **Scenes**, click **Talk** on a scene and ask *"What's a good night out for you?"*. The resident answers in character from their real simulated tastes. *(today)*
9. **Close (10 s):** "Agents with taste. Genus Loci: every city's culture is a living species."

**Rehearsed on the live site (2026-10-14):**
- Steps 1–3 and 6–8 ran end to end on production in London: scenes formed and were named; Scout ranked Westminster, Saint Giles and Lambeth and booked Ghetts; the co-pilot answered in 4 tool calls with ranges and clear-versus-noise effects; Sam from Lambeth gave an in-character interview.
- Steps 4–5 (map clicks: select, close, rewind, open with the ghost) weren't re-run this time because the browser pane was hidden (a hidden tab doesn't render). They were verified in M5.
- On the day: keep the tab visible and focused. Background tabs pause the 3D rendering, though the simulation keeps running.

**Fallbacks:**
- **If Qloo is slow:** prebuilt cities load from cached files.
- **If the AI provider is down:** use manual venue planning and City tools. Conversational explanations, resident interviews and scene naming remain unavailable. For setup and verification, see [Enabling the LLM locally](feature-walkthrough.md#enabling-the-llm-locally).
