# Genus Loci — Glossary, Pitch and Demo Runbook

<!-- generated: maintained by agents; keep in sync as plans land -->

> **Status (2026-10-10):** everything in the app runs on **synthetic stand-in data**. Real Qloo data arrives with Plans 3–4 (blocked on the API key). The AI co-pilot arrives with Plan 6. Names like "Cluster 0 Venue 1" and "Scene 12" are placeholders.

## Glossary

### Real concepts (they stay in the product)

| Term | Meaning | Source |
|---|---|---|
| **Entity** | Anything Qloo knows: an artist, a place (bar, club, restaurant), a brand, a film, a book… | Qloo catalogue (over 250M entities) |
| **Taste** | What one person loves, each with a strength. Called the agent's *genome* in code. | Seeded from Qloo audience data |
| **Affinity** | How strongly loving one entity predicts loving another ("people who love X also love Y"), from 0 to 1 | Qloo taste graph |
| **Tag** | A named category on an entity: genre (pop, techno), cuisine, style, vibe | Qloo entity metadata |
| **Venue** | A real place on the map that people go out to. It has a type, a capacity and health. | Qloo place entity |
| **Artist** | A musician. Appears in tastes, and as the headliner of an event. | Qloo artist entity |
| **Resident (agent)** | One simulated person: a home, a taste, friends. Goes out most weeks. | Simulation |
| **Scene** | A group of residents with similar taste, discovered by the simulation rather than defined. Scenes are born, grow, split, merge and die; the family tree tracks this. | Emerges from the simulation |
| **Archetype** | A starting taste profile for a group of people in an area, used to seed each neighbourhood | Qloo audience communities |
| **Niche** | A scene with many people but few suitable venues. Large niches auto-open a venue. | Simulation |
| **Fidelity** | How closely the simulated city's tastes match where those tastes really live (0–1) | Qloo heatmaps |
| **Heatmap** | Qloo's answer to "where in this city does the taste for X live?": an affinity score per map square (geohash) | Qloo Insights (`urn:heatmap`) |

### Placeholders that disappear with real data

- **Cluster:** six invented "taste clusters" (fake genres) used by the synthetic stand-in, hence names like "Cluster 0 Venue 1".
- **Synthville:** the synthetic fallback city.
- **"Scene N":** replaced in 5b-2 by names built from the scene's dominant Qloo tags (e.g. "indie rock · natural wine · vintage", plus a mock-Latin binomial).

### How it works

Every week, residents go out to a venue that suits their taste. There they're exposed to the venue's taste and the crowd's, and they adopt new things in proportion to Qloo affinities. Tastes drift, scenes form and evolve, and venues thrive or close depending on whether anyone comes.

### How Qloo data is used

| Qloo data | Used for | Status |
|---|---|---|
| Affinity (taste graph) | The physics: venue choice, adoption, drift | Synthetic now; real in Plans 3–4 |
| Audiences | Seeding each neighbourhood's residents | Synthetic now |
| Heatmaps | Placing tastes on the map, and the Fidelity check | Code ready; synthetic heatmaps now |
| Tags | Naming and describing scenes and venues | Planned (5b-2 / Plan 4) |
| Places (location, kind) | Venues on the map | Synthetic now; real in Plan 4 |

## Pitch

**The hackathon's ask:** agents are culturally blind; build the thing that only works because it knows what people love.

> Cities lose their culture one venue at a time, and nobody can see it coming. A venue closing, a rent rise or a new club isn't just one business: it's a shock to an ecosystem of scenes. **Genus Loci** grows a living model of a real city's culture from Qloo's taste graph. Thousands of residents carry real tastes, go out to real venues and influence each other. Venues, promoters and city culture teams can test a decision before making it: *"What happens to this scene if this venue closes? Where is the scene going next? What's this neighbourhood missing?"* An AI co-pilot runs the scenarios and explains the results in plain English.

- **Why it needs Qloo:** without the taste graph, the simulation has no physics. Venue choice, adoption and scene drift all come from Qloo affinities, and the heatmaps prove the simulated city matches the real one.
- **Who it's for:** independent venues (survival), promoters (where scenes are heading, and where to put an event), city night-time-economy teams (venue-closure policy).
- **Tagline:** *Every city's culture is a living species.*

### Open alignment questions (to resolve next)

- ~~Where to host what~~: **resolved** by **Scout a location** (Plan 5c). *Book for my venue* (what to put on at a venue) is next.
- ~~Closures invisible~~: struggling venues now pulse red and get a toast before they close; the demo city turns over (about 7 opens and 5 closes per 100 weeks). Closures don't yet explain *why* (e.g. "a rival nearby took its crowd").

## Demo runbook (about 3 minutes, as intended for demo day)

*(today)* marks what works now. Everything else needs Plans 3–4 (real data), 5b-2 (scene names) or 6 (co-pilot).

0. **Setup:** load the demo city (London, or NYC for US judges), paused at week 0, with the default camera.
1. **Hook (20 s):** "This is London tonight. Every dot is a resident with real taste from Qloo; every lit landmark is a real venue." Press **Play** at ½ wk/s. Crowds stream out along real streets, gather at venues and walk home. *(today)*
2. **Scenes emerge (30 s):** "Nobody told it what scenes exist. They emerge." Hover a row in the **Scenes** panel to highlight a scene's people and venues, then click to fly there. *(today, with placeholder names)*
3. **The proof (15 s):** point at **Fidelity** in the HUD: the simulated city matches where these tastes really live, according to Qloo heatmaps. *(needs real data)*
4. **The shock (40 s):** select the venue at the heart of the biggest scene, then **Close venue**. You see the implosion and the regulars scattering. Play a few weeks: toasts report the scene splitting or fading, and a venue auto-opening in the gap. *(today)*
5. **The what-if (40 s):** rewind with the timeline slider, which is exact. Instead, **Open a venue** nearby: pick a kind, watch the ghost preview, place it. The scene survives. "Two futures, one decision apart." *(today; side-by-side compare comes in Plan 7)*
6. **The promoter (40 s):** "You're a promoter. Where should this headliner play?" Open **Scout a location** and pick the headliner.
   - The city pauses, an amber demand glow shows where their fans live, and pins A–C appear.
   - The tool simulates 4 weeks at each spot and ranks them on turnout, new fans, scenes reached and harm to neighbours.
   - Drop your own pin D to compare, then **Book it**: shockwave, beacon, and the crowd converges. *(today)*
7. **The co-pilot (30 s):** *"What happens to the techno scene if Fabric closes?"* The agent sets up the scenario through Qloo and the simulation, runs it, and answers with numbers and named places. *(Plan 6)*
8. **Close (10 s):** "Agents with taste. Genus Loci: every city's culture is a living species."

**Fallbacks:**
- **If Qloo is slow:** prebuilt cities load from cached files.
- **If the AI provider is down:** the god-game toolbar does everything by hand.
