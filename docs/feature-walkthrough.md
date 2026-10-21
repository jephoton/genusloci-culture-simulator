# Feature walkthrough

A hands-on tour of every feature, in an order where each section sets up the next. It takes about 25–35 minutes. For the extended demo and an optional three-minute judge path, see [pitch-and-demo.md](pitch-and-demo.md#demo-runbook-allow-56-minutes).

<!-- generated: navigation updated for the focused interface -->

**Navigation:** the main screen shows the city, four workspace buttons and compact playback controls. **Venues**, **Scenes**, **City tools** and **Co-pilot** open one drawer at a time on desktop and phones. Start with **Venues → choose a venue → Plan a night here → Compare → Book**. The map is also clickable. **City overview** contains statistics and fidelity; **Playback** contains speed and rewind. In a venue, **Venue performance** contains detailed numbers and **Venue actions** contains **Close venue**. In the planner, expand **Schedule** for dates and duration.

**Without an LLM key:** the co-pilot drawer explains its unavailability and offers the venue flow. Resident interview buttons are hidden; scenes keep numeric names. Venue comparisons, bookings, scouting and city interventions still use the simulation. Outside-artist lookup separately needs Qloo. Configure one supported provider in `.env.local` (see `.env.example`) and restart to enable AI features; a configured key does not guarantee provider health.

### Enabling the LLM locally

1. Obtain an API key from one supported provider: DeepSeek, Groq, Cerebras, OpenRouter or Google Gemini. A Qloo key is separate and does not enable the language model. For a concrete setup path, follow the [official Groq quickstart](https://console.groq.com/docs/quickstart).
2. Edit the existing `.env.local` in the repository root. Preserve existing Qloo/storage settings; do not replace the file with the example. For Groq, add these lines with your own key locally (the value below is only a placeholder):

   ```dotenv
   GROQ_API_KEY=replace-with-your-own-key
   GROQ_MODEL=openai/gpt-oss-120b
   GROQ_SMALL_MODEL=openai/gpt-oss-20b
   ```

   The main model handles the co-pilot; the small-model setting handles scene names and interviews. These GPT-OSS IDs are listed in [Groq's supported models](https://console.groq.com/docs/models), checked 2026-10-21. Access and limits depend on your provider account. The explicit small-model override avoids relying on the repository's Llama default, which the current provider list labels Enterprise. One supported provider is enough; no new package installation is needed. Keep keys local, never in chat or committed files.
3. Stop the development server and restart from the repository root with `npm run dev -- --port 3000`, then reload the app. If an agent is running the server, ask it to restart after you save the key.
4. Visit `/api/copilot` on the same host. `{"configured":false}` means the running server sees no supported nonempty key; `{"configured":true}` only confirms configuration, not validity or credits. Reloading the app is necessary because its availability check runs on mount.
5. Open **Co-pilot** and ask **What scenes live here, and where?** after playing enough for scenes to form. A successful answer verifies more than the configuration flag. Authentication errors suggest an invalid/revoked key; quota/rate-limit errors require checking provider limits; an unavailable model requires checking model permissions and the provider's current model list.

For the hosted demo, configure the same environment variables on the hosting platform and redeploy. A local `.env.local` is not uploaded to Vercel. This walkthrough does not authorize adding keys or changing the deployment automatically.

**Where:** https://genusloci-culture-simulator.vercel.app, or `pnpm dev` and http://localhost:3000.

**Before you start:**
- Keep the tab **visible and focused**. A background tab stops drawing the 3D city (the simulation keeps running), so dots look frozen and white.
- To see the intro again: in the browser console, run `localStorage.removeItem("genusloci.intro.v1")` and reload, or press **?** (bottom right).
- **Esc** cancels placement and closes the workspace. **Playback → Rewind** returns to an earlier simulated date.
- Each section notes whether it needs live services: the LLM (DeepSeek) or Qloo.

---

## 1. First look (2 min)

1. **Open the site.**
   - *Expect:* the intro card ("Genus Loci … Reading the map … Try this").
   - Click **Start exploring**. Reload and it shouldn't show again.
2. Open **City overview** for date ("Week 0 · Mon"), residents (2500), venues, events, scenes (0), fidelity (about 0.17). Close it to keep the map clear.
3. **Orbit the map:** drag to pan, scroll to zoom, right-drag to rotate.
   - *Expect:* real London streets, the Thames, parks, lit landmarks (venues) and white dots (residents at home).
4. **Bottom right:** "Map data © OpenStreetMap contributors · Taste data: Qloo".

## 2. The city comes alive (3 min)

1. Press **Play** at 1 day/s.
   - *Expect:* each day, residents walk out along the streets to venues and back home; the date ticks.
2. Open **Playback** and try the speeds **½ / 1 / 2 / 4** day/s, then **Pause**.
   - *Expect:* pause freezes everything mid-step; Play continues from there.
3. **After about week 1, open Scenes:**
   - *Expect:* 6–8 scenes appear with sizes and top tastes. A few seconds later they get plain names, such as "Historic theatre crowd" or "Grime friend groups". **Names need the LLM**; without it they stay "Scene N".
   - *Expect:* dots take on their scene's colour.
4. **Hover** a scene row to highlight its people and venues; move away to clear.
5. **Fidelity:** it should sit around 0.17–0.22 for London and creep up over the weeks.

## 3. Scenes up close (3 min)

1. **Click** a scene row.
   - *Expect:* the camera flies there, other dots dim, and a **scene card** appears:
     - size, plus a size-over-time line once a few weeks have passed;
     - "Into …" tags and "Listens to …" artists;
     - "Lives in …" neighbourhoods and "Out tonight at …" venues;
     - "Split from / Split into" links, if any;
     - **Talk to someone from this scene**, when an LLM provider is configured.
2. Click the row again, or **Clear focus**, to unpin.
3. **Switch the Scenes panel to Family tree.**
   - *Expect:* scenes nested under the ones they split from, with faded ancestors in grey italics.
   - Natural splits are **rare** (London typically has 1–2 per 60 weeks), so it's often flat. The newcomer tools in section 5 can help provoke one.

## 4. Venues (4 min)

1. **Click a landmark,** for example a big one near the centre.
   - *Expect:* a venue panel with:
     - kind and name, open or closed, and visitors tonight;
     - **Venue performance**: health, rolling weekly visits, effective capacity and rent multiplier;
     - **Plan a night here**; **Venue actions** expands to reveal **Close venue**.
2. **Struggling venues:**
   - *Expect:* while playing, some venues pulse red with a toast such as "X is struggling: few visitors".
   - After about 8 weeks below 40% occupancy one closes. Its panel then says why, for example "Health stayed below 40% for 8.1 weeks. The last rolling week had N visits against M rent-adjusted capacity."
3. **Close a venue yourself** with **Venue actions → Close venue**.
   - *Expect:* an implosion effect, the building sinks, and regulars scatter. The panel says "Closed by your intervention."

## 5. City tools (6 min)

Open **City tools**. **Open a place** contains venue creation; **Events and scouting** contains events and location scouting; **Neighbourhood changes** contains newcomers and rent. Selecting something to place closes the drawer and shows a map instruction with **Cancel**. Switching workspace sections also cancels the active tool.

1. **Open a venue:**
   - pick a kind (some are greyed out if the city has none), then move over the map;
   - *expect* a ghost preview, then click to place;
   - *expect* a shockwave, the landmark rising, and a toast like "Opened a club in Soho".
2. **Throw an event:**
   - pick a headliner (grouped as "Loved by <scene>"), then click the map;
   - *expect* a light beacon and crowds converging; a toast "<artist> is playing tonight".
3. **Bring in newcomers:**
   - pick **50 / 100 / 200**, then a scene whose taste they share, then click the map;
   - *expect* residents to go up by that number and a toast "100 newcomers who share <scene>'s taste moved into <area>".
   - The demo keeps 300 spare resident slots; past that it refuses.
4. **Raise the rent:**
   - pick **+25% / +50% / +100%**, then click the map;
   - *expect* a toast "Rents up 50% around <area>". Venues there now need bigger crowds; watch for red pulses over the next weeks.
5. **Rewind:** open **Playback** and drag the rewind slider back before your changes.
   - *Expect:* the city returns exactly to that day; your changes are gone.

## 6. Scout a location (3 min)

1. Open **City tools → Events and scouting → Scout a location** and pick a headliner.
   - *Expect:* the city pauses, an amber glow shows where their fans live, and pins **A–C** appear.
   - A results panel ranks the spots on turnout, new fans, "Neighbours lose", and the scenes reached, with a one-line verdict. It runs 3 seeded runs per spot.
2. **Click the map** to add your own spot **D**.
   - *Expect:* it's compared too.
3. **Book it** on a card.
   - *Expect:* "Booked <artist> in <area>", a shockwave and a beacon. Play resumes if it was playing.

## 7. Book for my venue (5 min, outside artists need Qloo)

1. Select a venue, then **Plan a night here**.
   - *Expect:* a panel with 3 suggested acts (artists Qloo links to this venue's crowd).
2. **Add an in-city artist:** start typing in "Add an artist"; suggestions autocomplete.
3. **Add an outside artist** the city doesn't know, for example **Burna Boy** in London or **Fred again..** in New York.
   - *Expect:* "Asking Qloo…", then an entry with "From Qloo: their fans also like …".
   - Some artists connect thinly, and that's shown honestly.
4. **Dates:** expand **Schedule** and set the start week and day, and either a run of **1 / 2 / 4 weeks** or **exact nights** (for example 1 night on Saturday of next week).
   - The line below confirms it, for example "1 night starting in week 2 · Sat".
5. **Compare.**
   - *Expect:* ranked cards with turnout, **Your usual nights** (green = the act brings extra visits to your venue, red = it takes from them), new fans ("n/a" for outside artists), neighbour loss, and the scenes drawn. The verdict leads with your venue.
6. **Book** the best act.
   - *Expect:* a toast "Booked <act> at <venue> for 1 night, week 2".
7. Close planning/venue inspection, open **Venues**, then expand **Event calendar (1 upcoming)** above the venue list.
   - *Expect:* your booking with its date and status "scheduled", and **Cancel booking**. Outside artists keep their own name.
8. Play until the date.
   - *Expect:* the event starts (status "started", then "completed").
9. **Cancel** another future booking.
   - *Expect:* status "cancelled".

To try for a scene split: bring in 200 newcomers of the smallest scene in two different areas (section 5), then play about 12 weeks. A new scene or split shows up about two times in three.

## 8. Co-pilot (6 min, needs the LLM; some answers use Qloo)

Open **Co-pilot** in the workspace navigation. With a configured LLM, each answer takes 10–30 s; the steps it takes show as ticked lines. With no configured provider, the drawer explains setup and offers **Choose a venue** instead of a chat box.

1. **"What scenes live here, and where?"**
   - *Expect:* scenes with sizes, tastes and home neighbourhoods.
2. **"What happens if the busiest club closes?"**
   - *Expect:* "Ranked the busiest venues", then "Simulated 8 weeks, with and without the change".
   - The answer names the club, gives visit shifts with ranges (e.g. "+23, range +17 to +28"), and separates clear effects from ones too small to call.
   - The live city is unchanged.
3. **"Close it in the live city."**
   - *Expect:* "Changed the live city", the camera flies there, and the venue closes.
4. **"What if I booked Burna Boy at <a venue> for one night next Saturday?"** (outside artist and dated booking)
   - *Expect:* it uses Qloo's picture of the artist's fans and says so.
5. **"What's on the event calendar?" / "Cancel that booking."**
   - *Expect:* it lists bookings and cancels the one you name.
6. **"Which venues are struggling, and why?"**
   - *Expect:* the lowest-health venues, with measured reasons.
7. **"What kind of crowd likes Ghetts?"**
   - *Expect:* a live Qloo taste lookup ("Asked Qloo what … fans like"). At most 4 Qloo calls per question.

If it says no language model is configured, use the manual venue and city tools. Conversational explanations and interviews require a provider.

## 9. Meet a resident (2 min, needs the LLM)

1. With a provider configured, open **Scenes** and click **Talk** on a scene row (or **Talk to someone from this scene** on the scene card). These controls are hidden without configuration.
   - *Expect:* a panel headed "<Name>, <age band> · <area>", with the scene, "Into …" tastes and their last night out.
2. Ask **"What's a good night out for you?"**, then something outside their taste (e.g. "Do you like opera?").
   - *Expect:* answers in character, from their tastes only. Off-taste questions get "not really my thing".
3. **Meet someone else from this scene** brings in the next most typical member.

## 10. Other cities (2 min)

1. Switch the city in the top bar to **New York**, then **Singapore**.
   - *Expect:* a fresh simulation each time. New York is Houston St at Broadway (Broadway's diagonal is visible, fidelity about 0.31 at week 60). Singapore is Marina Bay and the river (fidelity lower, about 0.11).
2. Run a quick Scout or co-pilot question in each, to see local venues and artists.

## 11. Phone layout (2 min)

1. Narrow the window below about 640 px, or use device mode in DevTools.
   - *Expect:* the top bar shows city and **City overview**; **Venues · Scenes · City tools · Co-pilot** opens one drawer at a time. Date remains in playback; fidelity is in **City overview**.
2. Pick a placing tool.
   - *Expect:* the tools panel closes so you can tap the map.

## 12. Accessibility (1 min)

- **Tab** through the controls: *expect* visible violet focus rings.
- Turn on your OS "reduce motion" setting and reload: *expect* no shockwave, shake or camera flights (jumps instead). Ground ripples remain.

## 13. Operator: on-demand builds (optional; spends real Qloo quota)

- `/build-city` needs `WORLD_BUILD_TOKEN` set on the server; it is **not** set in production, so the page answers "World builds are disabled".
- Setup and the quota rules are in [on-demand-world-builds.md](on-demand-world-builds.md). Don't run a real build casually: each one uses up to 180 Qloo calls.

---

## Checklist

| # | Feature | Needs | ✓ |
|---|---|---|---|
| 1 | Intro, map, attribution | — | |
| 2 | Play/pause/speeds, scenes form, scene names, fidelity | names: LLM | |
| 3 | Scene card, focus, family tree | — | |
| 4 | Venue panel, struggling pulse, closure explanation, manual close | — | |
| 5 | Open venue, event, newcomers, rent, rewind | — | |
| 6 | Scout A–C plus D, Book it | — | |
| 7 | Plan a night: suggestions, outside artist, dates, compare, book, calendar, cancel | outside artist: Qloo | |
| 8 | Co-pilot: summary, what-if, apply, outside act, calendar, struggling, Qloo taste | LLM (+ Qloo) | |
| 9 | Resident interview | LLM | |
| 10 | New York, Singapore | — | |
| 11 | Phone layout | — | |
| 12 | Focus rings, reduced motion | — | |
| 13 | /build-city (disabled in prod) | token, Qloo | |

**Known limits to keep in mind:** natural scene splits are rare; what-ifs are 4-run averages, so small effects can read "too small to call"; co-pilot answers take 10–30 s; the events count in **City overview** can lag a few days (it updates every 4th day).
