# Devpost submission

<!-- generated: final copy for the venue race with the scout agent, 2026-10-25; check the live demo before submitting -->

**Project name:** Genus Loci

**Elevator pitch (200 characters max):**

> Pick an artist. An AI scout uses Qloo to choose three venues, then each hosts the artist in its own copy of a simulated city. Watch the crowds walk in and see which venue wins.

**Project started:** 9 October 2026 (first commit, 10:50 Singapore time).

---

## Inspiration

Where should an artist play? A chat model can name venues that sound right, but it can't show you who would actually turn up, or why one room beats another. A venue draws its crowd from who lives nearby and what they like, so culture is made by people and places together. We wanted to watch that happen in a real city, using real taste data from Qloo, instead of reading a guess.

## What it does

Genus Loci answers one question: **which venue would draw the biggest crowd for this artist?**

1. **Pick an artist.** Choose one from the city's data or type any name; artists the city doesn't know are looked up live in Qloo. While you choose, the city is live: about 2,500 simulated residents go out, pass tastes on and form taste scenes, shown as coloured dots.
2. **The scout agent picks three venues.** It looks the artist up in Qloo and reads the venues' Qloo tags. When the city's stored data is thin, it asks Qloo live which of the city's nightclubs, music venues and bars the artist's fans like. It commits to venues A, B and C, with a one-line reason for each and a visible trace of what it looked up. For arena-level acts, it says plainly that the area's venues are far smaller. Each venue's regulars glow in its colour on the map.
3. **Watch the race.** Each venue hosts the artist in its own copy of the same city, from the same moment and with the same luck, night by night. You see one dot per visit walking the real streets to each venue, while the tallies climb.
4. **Read the result.** It names the winner and checks it against two more futures with different luck. Each venue shows its range of visits, its usual nights against the nights with the event, and the visits it took from venues nearby. The agent writes a two-sentence explanation from those numbers.
5. **Change anything and race again** from the step tabs. Hover or click any venue to see its status and regulars by taste scene; **Taste scenes** lists the city's scenes and lights them up on the map.

## How we built it

- **Qloo for the cultural grounding.** Place insights supply the venues and their tags. Artist recommendations build a taste graph linking artists, tags and venues. Heatmaps seed where each taste lives, which decides who lives within reach of each venue. Live Qloo calls handle artists outside the city's data and the agent's venue lookups. Qloo access is cached, validated and budgeted.
- **An artificial-life city in a Web Worker.** Each resident carries a sparse taste genome. On a night out they choose a venue by taste, distance and friends. A visit reinforces the tastes they share with the venue and can pass on new ones, unused tastes fade, and residents with similar tastes cluster into scenes that grow, split and fade. Venues that draw too few visitors for their size struggle and close.
- **Fair races.** A no-event baseline and one forked future per venue step together from the same seed. The race on screen is exactly future 1 of the three-future forecast, and a test checks that.
- **A scout agent** built with the Vercel AI SDK (Gemini first, Groq as backup). It has tools to read the artist's Qloo taste, rank the city's venues live with Qloo, inspect a venue and commit a choice. The browser validates the choice against the city's venues. The agent never produces the numbers: those come from the simulation.
- **The map** is React Three Fiber on real OpenStreetMap streets. Residents walk street routes to their venue, and the camera frames the three venues automatically.
- Next.js on Vercel, with private Vercel Blob storage for the generated Qloo worlds. TypeScript and zod throughout, and about 660 Vitest tests.

## Challenges we ran into

- **A simulation needs a question.** Earlier versions let you close venues, raise rents, book events and chat about all of it at once. None of it added up to a story. We cut everything that didn't serve one question, one flow and one picture: three colours of people walking to three venues.
- **Sparse links.** The stored data linked each venue to only the 15 artists Qloo recommended for it, so a third of London's artists matched no venue at all. Giving the agent a live, location-filtered Qloo venue lookup fixed it. Our first attempt returned landmarks worldwide, because location was being sent as a ranking signal rather than a filter.
- **Making a handful of people visible.** Each venue draws only tens of simulated people a night. Bigger, venue-coloured dots and a dimmed city made them readable. So did drawing one dot per visit: many residents would go to whichever venue hosted, and with one dot each, a whole colour could go missing.
- **Being honest about what's modelled.** Qloo tells us which tastes and places go together, not seat counts or real turnout, so the app labels its numbers as visits by simulated residents and never as ticket sales.

## Accomplishments that we're proud of

- A comparison you can watch: the same city run with one difference, with the difference shown as people walking down real streets.
- An agent that does a step of the flow instead of chatting beside it. It works around gaps in the data with live Qloo calls and shows its reasoning.
- Reproducible results: same seed, same race, and every winner is checked against other futures.
- It works for any artist, including ones the city's data has never seen.

## What we learned

A watchable comparison beats a pile of tools. Grounded data isn't validated dynamics: Qloo grounds who likes what and where, but our behaviour rules are assumptions, and saying so made the product clearer, not weaker. And an agent earns its place when it decides something the user would otherwise have to work out, not when it adds a chat box.

## What's next for Genus Loci

- Real venue constraints (capacity, availability, price) alongside cultural fit, so an arena act gets arena options.
- Larger city areas and more cities.
- Testing with promoters and bookers whether the race helps them shortlist venues, compared with a plain LLM's suggestions. No user study or real-world validation has been done yet.

## Built with

`typescript` · `next.js` · `react` · `three.js` · `react-three-fiber` · `qloo` · `vercel-ai-sdk` · `gemini` · `groq` · `openstreetmap` · `vercel` · `vercel-blob` · `web-workers` · `zod` · `tailwindcss` · `vitest`

## Try it out

- Live demo: https://genusloci-culture-simulator.vercel.app/
- Source code: https://github.com/jephoton/genusloci-culture-simulator
