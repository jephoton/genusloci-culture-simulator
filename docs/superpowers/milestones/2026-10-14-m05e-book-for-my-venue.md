# M5e — Book for my venue (with outside acts via live Qloo)

**Goal:** the venue owner's version of Scout. Pick *your* venue, line up candidate acts, compare them on forked futures, and book the best. Acts can include **artists the city doesn't know**: Qloo is asked live who their fans are, so the "Qloo inside an agent" path is visible in the product, not just in the build.

## Design

- **Events with a taste profile (sim).** `scheduleEvent` takes an optional `profile: { entity, weight }[]` of in-city entities. With a profile, the event's taste is that profile instead of its entity's edges. An outside artist is simulated as "a crowd that likes these in-city artists and tags".
- **Booking engine (sim, `booking.ts`).** `bookActs(live, hostVenue, acts, { weeks, runs })` runs each act as an event at the host venue's cell, next to a no-event baseline from the same seed, over 3 paired seeded runs. Per act it reports:
  - turnout;
  - **host change** (the host venue's own visits against the baseline: a halo or cannibalisation);
  - new fans (in-city artists only);
  - scenes reached;
  - neighbour loss.
  Results are ranked, and the shared run logic is factored out of Scout.
- **Worker:** a `book` command; `SimClient.book` and `useSimulation.book`.
- **Outside acts (server, live Qloo).** `POST /api/outside-act { city, name }` loads the city's world and makes three calls:
  1. Qloo `search` (artist);
  2. `recommend` artists for that artist's fans;
  3. `tagAffinities`.
  It intersects the results with the world's entities (artist IDs are Qloo IDs; tags are URNs) and returns `{ artist, similar[], tags[], profile[], proxy }`. The calls are cached, rate-limited and kept above the monthly floor of 1000. Unknown or no-data artists get a clear message.
- **Co-pilot:** `throw_event` accepts `outside_artist: "<name>"` instead of `artist`. The browser resolves it through `/api/outside-act` before the what-if or apply.
- **UI:** the venue panel gets a "Plan a night here" button, which opens a booking panel in the right column:
  - suggested acts (the artists most linked to this venue's taste), an in-city artist picker, and an outside-artist search;
  - run length of 1, 2 or 4 weeks;
  - Compare, then result cards and Book it.
  An outside act shows "simulated from Qloo: fans also like A, B, C".

## Out of scope

Specific dates or nights: the simulation can't schedule an action for a future tick yet. This is a follow-up.

## Tasks

1. Event profiles in the action schema, validation and application. Tests.
2. `booking.ts` plus the shared run core with Scout. Tests.
3. The worker `book` command, client and hook. Tests.
4. `/api/outside-act` with matching logic in `agents/outside-act.ts` (pure intersection, tested with synthetic data).
5. Co-pilot `outside_artist` support.
6. Booking panel UI, plus the venue panel button.
7. Live check and docs.
