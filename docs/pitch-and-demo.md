# Genus Loci — pitch and demo runbook

<!-- generated: describes the current implementation, not the older public sandbox -->

## Pitch

**Which venue would draw the biggest crowd for this artist?** Genus Loci answers with a race you can watch. Pick an artist. Qloo's taste data shortlists the three existing venues whose crowds fit best (A, B, C). Then each venue hosts the artist in its own copy of the same simulated city, from the same moment and the same luck, night by night. Each venue's event visitors glow in its colour as they walk there, and the tallies climb. The result says who drew the most, checks it against two more futures with different luck, and shows what the event did to the venue's usual nights and to its neighbours. Change the venues, the first night, the number of nights or the artist, and race again.

Qloo supplies the venues, their taste tags, artist affinities and the heatmaps that seed where tastes live. The residents and their behaviour are simulated: visits are by simulated people, not ticket sales or a validated forecast.

**One line:** pick an artist, race three Qloo-matched venues in parallel simulated futures, and see who draws the crowd and why.

## Why this needs Qloo

- Venue matching: the shortlist ranks open venues by Qloo affinity to the artist (or, for an artist the city doesn't know, to Qloo's live picture of their fans).
- Taste geography: Qloo heatmaps seed where each taste lives, which decides who is within reach of each venue.
- Adoption: artist and tag affinities shape what residents like and pass on.
- The scout agent looks the artist up in Qloo and reads the shortlisted venues' Qloo tags before choosing which three race.

Without Qloo the simulator runs on a labelled synthetic city, but the shortlist and the crowds lose their real-world basis.

## Demo runbook (about 3 minutes)

Rehearse on the published build of this branch, in a visible browser window (a hidden or background tab throttles the animation).

1. **Orient (20 s).** London loads with a short intro: the question, the four steps, what's real and what's simulated. Close it.
2. **Pick an artist (20 s).** Click a suggested artist (for example Wiley) or type one. Typing an artist the city doesn't know looks them up live in Qloo.
3. **The scout agent and the shortlist (50 s).** The scout agent checks the artist in Qloo and the venues' tags (a few seconds), then picks three, each with a one-line reason; open its summary to show what it looked up. The venues appear lettered and coloured. The camera frames them and each venue's regulars glow in its colour; everyone else dims. Point out Qloo fit and regulars on each card. Optionally swap a venue, or change the first night or the number of nights.
4. **The race (40 s).** Click **Start race** (or the Race tab). Each night, the event visitors walk to their venue in its colour (bright), while earlier nights' visitors stay faintly lit. The badges and bars climb. Use Slow if you want to talk over it, or Pause.
5. **The result (40 s).** Read the headline: who drew the most, whether it also won the other two futures, and the agent's two-sentence write-up of why. Each card shows the range across futures, the venue's usual nights versus with the event, and visits taken from venues nearby.
6. **Tweak and rerun.** Click the **Venues** tab, change something, and race again. **Watch again** replays the same race exactly.

## Honest answers to likely questions

| Question | Answer |
| --- | --- |
| Is the race fair? | Each venue runs in its own copy of the same city, from the same state and random seed, so the only difference is where the event is. The race shown is one of three seeded futures; the result says how many each venue won. |
| Why so few people? | About 2,500 simulated residents, and each night only those who go out and live within 1.5 km can come. The totals are model visits, not real headcounts. |
| What's agentic? | The scout agent (Vercel AI SDK tool calling) decides which venues race: it calls Qloo for the artist's taste, inspects venues' Qloo tags, then commits a choice with reasons. It also explains the result. The race and its numbers come from the deterministic engine, not the model. |
| What if the LLM is down? | The race works without it: the panel says so and races the three best Qloo fits, with no write-up. |
| Does it predict real ticket sales? | No. It shows how a Qloo-grounded model city responds under authored rules. No real-world validation is claimed. |
| Where did closures, rent and the calendar go? | They are still in the engine, but the interface now has one flow. They didn't feed the venue question. |

## Submission and access

[Official overview](https://qloo.devpost.com/) and [rules](https://qloo.devpost.com/rules), checked 2026-10-23: publish a working external demo, public source with detectable open-source licence, and a matching text description. The four criteria are equally weighted. The deadline is 31 October 2026, 11:45 am Singapore time (30 October, 11:45 pm EDT). Recheck announcements before submitting; the overview now says the top three finalists will appear on air on 5 November and need availability/preparation.

Keep judge access free and unrestricted through the published judging period. Current rules list judging through 5 November Eastern time; the older November 16 note was obsolete. Submission and finalist participation remain the user's actions. See [judging alignment](judging-alignment.md) for checked facts and outstanding gates.

## Release checklist

- Publish this branch; verify the public URL shows the venue race (not the older sandbox or chat lab).
- Confirm a Qloo world loads (no "synthetic stand-in" notice) and the suggested artists produce three venues.
- Run a full race and the result on the public URL, in a visible window. Check the agent's picks and write-up appear.
- Resolve the installed Next.js security advisories and reverify the patched build before publishing (see [judging alignment](judging-alignment.md)).
- Keep the README, Devpost draft and hosted UI consistent. No raw Qloo cache or world files, credentials or secret-bearing logs in Git or submission artifacts.
