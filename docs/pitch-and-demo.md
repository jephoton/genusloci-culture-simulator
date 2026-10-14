# Genus Loci — Glossary, Pitch and Demo Runbook

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
| **Venue** | A real place on the map that people go out to. It has a type, a capacity and health. Its body colour is its own scene (best taste match); its neon sign is tonight's dominant crowd. | Qloo place entity |
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
- **Scene names:** an LLM names each scene once, from its real Qloo tastes and home neighbourhood: a plain name plus a mock-Latin binomial, e.g. "Grime friend groups" (*Grimus lambethiensis*). "Scene N" shows until the name arrives.
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

- **Why it needs Qloo:** without the taste graph, the simulation has no physics. Venue choice, adoption and scene drift all come from Qloo affinities, and the heatmaps prove the simulated city matches the real one.
- **Who it's for:** independent venues (survival), promoters (where scenes are heading, and where to put an event), city night-time-economy teams (venue-closure policy).
- **Tagline:** *Every city's culture is a living species.*

### Open alignment questions (to resolve next)

- ~~Where to host what~~: **resolved** by **Scout a location** (M5c). *Book for my venue* (what to put on at a venue) is next.
- ~~Closures invisible~~: struggling venues now pulse red and get a toast before they close; the demo city turns over (about 7 opens and 5 closes per 100 weeks). Closures don't yet explain *why* (e.g. "a rival nearby took its crowd").

## Demo runbook (about 3 minutes, as intended for demo day)

*(today)* marks what works now.

0. **Setup:** load the demo city (London, or NYC for US judges), paused at week 0, with the default camera.
1. **Hook (20 s):** "This is London tonight. Every dot is a resident with real taste from Qloo; every lit landmark is a real venue." Press **Play** at ½ wk/s. Crowds stream out along real streets, gather at venues and walk home. *(today)*
2. **Scenes emerge (30 s):** "Nobody told it what scenes exist. They emerge." Hover a row in the **Scenes** panel to highlight a scene's people and venues, then click to fly there. *(today, with placeholder names)*
3. **The proof (15 s):** point at **Fidelity** in the HUD. Residents were seeded from one set of Qloo heatmaps; fidelity checks them against *different* Qloo heatmaps, and it rises as the city runs (London about 0.17 → 0.20 over a year, Singapore 0.04 → 0.12). Be honest that it's modest: it's a real, falsifiable check, which is the point. *(today)*
4. **The shock (40 s):** select the venue at the heart of the biggest scene, then **Close venue**. You see the implosion and the regulars scattering. Play a few weeks: toasts report the scene splitting or fading, and a venue auto-opening in the gap. *(today)*
5. **The what-if (40 s):** rewind with the timeline slider, which is exact. Instead, **Open a venue** nearby: pick a kind, watch the ghost preview, place it. The scene survives. "Two futures, one decision apart." *(today; side-by-side compare comes in M7)*
6. **The promoter (40 s):** "You're a promoter. Where should this headliner play?" Open **Scout a location** and pick the headliner.
   - The city pauses, an amber demand glow shows where their fans live, and pins A–C appear.
   - The tool simulates 4 weeks at each spot and ranks them on turnout, new fans, scenes reached and harm to neighbours.
   - Drop your own pin D to compare, then **Book it**: shockwave, beacon, and the crowd converges. *(today)*
7. **The co-pilot (30 s):** open **Ask the co-pilot** and pick *"What happens if the busiest club closes?"*. It reads the city, ranks the clubs, runs an 8-week what-if against a no-change baseline, and answers with real venue names, visit shifts and scene sizes, and says when an effect is noise. Then ask it to *"close it in the live city"* to watch it act. *(today)*
8. **Meet a resident (20 s):** click **Talk** on a scene in the legend and ask *"What's a good night out for you?"*. The resident answers in character from their real simulated tastes. *(today)*
8. **Close (10 s):** "Agents with taste. Genus Loci: every city's culture is a living species."

**Fallbacks:**
- **If Qloo is slow:** prebuilt cities load from cached files.
- **If the AI provider is down:** the god-game toolbar does everything by hand.
