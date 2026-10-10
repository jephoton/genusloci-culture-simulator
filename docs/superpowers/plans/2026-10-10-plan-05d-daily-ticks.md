# Plan 5d: Daily Ticks, True Pause, Venue Identity Colour — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal** (user decisions, 2026-10-10):
1. **Simulate every day:** one tick = one day in the demo. Residents decide each day whether to go out, weighted towards Friday and Saturday, so weekly visit totals stay about the same.
2. **True pause:** pausing freezes the current frame mid-animation, not just the tick stream.
3. **Venue identity colour:** a venue's body and roof band show its *own* scene, the live scene its taste best matches. The neon sign keeps showing tonight's dominant visitors.

**Architecture:**
- **One new setting: `ticksPerWeek`** (default **1**, so behaviour, tests and calibration are unchanged; the demo uses **7**).
  - **Weekly-rate settings become per-tick rates:** outing, drift, decay and health EMA all convert as `1 − (1 − p)^(1/ticksPerWeek)`.
  - **Week-denominated settings become ticks:** grace period, close-after, scene cadence and event duration multiply by `ticksPerWeek`.
  - **Venue health** uses a rolling 7-tick visit sum, so occupancy keeps meaning "visits per week vs capacity". A quiet Tuesday can't close a venue.
  - **Weekday weights** scale each day's outing probability (mean 1).
- **Frames:** gain `ticksPerWeek` (so the UI can label days) and `venueScene`, the identity scene per venue, by cosine of the venue's taste profile against the live scene centroids.
- **Pausable clock:** the browser animates from a `SimClock` that only advances while playing. Every animation (crowd, effects, landmarks, auras, glows) reads it instead of `performance.now()`.

**Tech Stack:** as before.

**Rules:**
- Atomic commits in Conventional Commits format; end each message with a blank line and `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Run `pnpm test`, `pnpm exec tsc --noEmit` and `pnpm lint` before each commit (add `pnpm build` for UI work).
- TDD for sim changes. Keep LF line endings.
- **All existing tests must keep passing unchanged**, which proves `ticksPerWeek: 1` is identical to before. Only add tests.

---

### Task 1: Time scaling in the simulation (TDD)

**Files:**
- Create: `src/sim/time.ts`, `src/sim/time.test.ts`.
- Modify: `src/sim/config.ts` (schema + defaults), `src/sim/steps/outing.ts`, `src/sim/steps/drift.ts`, `src/sim/steps/decay.ts`, `src/sim/steps/venues.ts`, `src/sim/step.ts`, `src/sim/actions/apply.ts`, `src/sim/state.ts`, `src/sim/venue-table.ts`.

- [ ] **Step 1: Add the settings and helpers**

Add to `SimConfig`, the defaults, and `SimConfigSchema` (keep the exact-type check):
```ts
  /** Ticks per simulated week: 1 = weekly ticks (default); 7 = daily ticks. Week-denominated settings scale by this. */
  ticksPerWeek: number;              // int 1..7, default 1
  /** Relative outing likelihood Mon..Sun when ticksPerWeek is 7 (normalised to mean 1). */
  weekdayWeights: number[];          // length 7, each ≥ 0, default [0.6, 0.6, 0.7, 0.9, 1.5, 1.9, 0.8]
```
Document in `config.ts` that `graceTicks`, `closeAfterTicks`, `sceneEvery` and event `duration` are **in weeks** (equal to ticks when `ticksPerWeek` is 1), and that `outingRate`, `driftRate`, `decayRate` and `healthAlpha` are **weekly** rates.

`src/sim/time.ts`:
```ts
import type { SimConfig } from "@/sim/config";

/** Per-tick probability equivalent to weekly probability p: 1 − (1 − p)^(1/ticksPerWeek); exact identity at 1. */
export function perTick(p: number, ticksPerWeek: number): number {
  if (ticksPerWeek === 1) return p;
  return 1 - Math.pow(1 - Math.min(1, Math.max(0, p)), 1 / ticksPerWeek);
}

/** A duration in weeks as a whole number of ticks (at least 1 when weeks > 0). */
export function weeksToTicks(weeks: number, ticksPerWeek: number): number {
  return weeks <= 0 ? 0 : Math.max(1, Math.round(weeks * ticksPerWeek));
}

/** Outing multiplier for the day of `tick` (Mon = tick 0); always 1 with weekly ticks. */
export function weekdayFactor(config: Pick<SimConfig, "ticksPerWeek" | "weekdayWeights">, tick: number): number {
  if (config.ticksPerWeek === 1) return 1;
  const w = config.weekdayWeights;
  const mean = w.reduce((a, b) => a + b, 0) / w.length || 1;
  return w[tick % w.length] / mean;
}
```

- [ ] **Step 2: Write the failing tests** (`src/sim/time.test.ts` plus additions to the existing step tests):
  - **`perTick`:** is the identity at 1. Compounding 7 daily probabilities equals the weekly one: `1 − (1 − perTick(0.45, 7))^7 ≈ 0.45`.
  - **`weekdayFactor`:** has mean 1 over a week, Saturday is greater than Monday, and it's 1 when `ticksPerWeek` is 1.
  - **Daily outings:** with `ticksPerWeek: 7`, average visits per resident per 7 ticks is within ±25% of the weekly config's average visits per tick (fixed seed, about 600 agents, measured over 4 weeks). More outings happen on day 5 (Saturday) than on day 0 (Monday).
  - **Venue health:** with `ticksPerWeek: 7`, a venue's health tracks its rolling 7-day visits. A venue full on Friday and Saturday but empty Monday to Thursday doesn't start counting low days. A venue empty all week closes after about `closeAfterTicks × 7` low ticks past the grace period, not after `closeAfterTicks` ticks.
  - **Events:** an event scheduled with `duration: 2` stays open for 14 ticks when `ticksPerWeek` is 7.
  - **Determinism:** the same seed gives the same hash with `ticksPerWeek: 7`.

- [ ] **Step 3: Implement**
  - **`outing.ts`:** the go-out roll becomes `rng.next() >= perTick(config.outingRate * s.energy[i], tpw) * weekdayFactor(config, s.tick)`.
  - **`drift.ts`:** `perTick(config.driftRate * s.curiosity[i], tpw)`. **`decay.ts`:** pass `perTick(decayRate, tpw)`.
  - **Venue visit history in the state:** `venueVisitHistory: Int32Array` (venue slots × `ticksPerWeek`, a ring buffer) and `venueWeekVisits: Int32Array` (the rolling sum per venue slot).
    - Allocate them in `initState`. `addVenue` zeroes the slot's history.
    - They're typed arrays, so `cloneState` and `hashState` already cover them.
  - **`venues.ts`:**
    - Each tick, push `venueAttendance[v]` into the ring and update the rolling sum.
    - occupancy = `min(1, venueWeekVisits[v] / effectiveCapacity)`; alpha = `perTick(healthAlpha, tpw)`.
    - The grace check is `s.tick >= weeksToTicks(graceTicks, tpw)`; closing happens when `venueLowTicks[v] >= weeksToTicks(closeAfterTicks, tpw)`.
    - With `ticksPerWeek` = 1 the ring has length 1, the sum equals today's attendance, and the behaviour is identical.
  - **`step.ts`:** scenes and auto-open run when `s.tick % weeksToTicks(sceneEvery, tpw) === 0`.
  - **`apply.ts`:** event `expires = s.tick + weeksToTicks(a.duration, tpw)`.
  - **Check the call sites** for anything else that measures time in ticks (e.g. `niches.ts`, `scout.ts` weeks, `calibration`). Convert week-denominated parameters with `weeksToTicks`.
- [ ] **Step 4: Run the full suite.** Every pre-existing test must pass unchanged; the new tests must pass.
- [ ] **Step 5: Commit:** `feat(sim): support daily ticks with weekly-equivalent rates and weekday rhythms`.

---

### Task 2: Frames carry the week length and venue identity scenes

**Files:** modify `src/sim/frame.ts` and `src/sim/frame.test.ts`.

- Add `ticksPerWeek: number` (from the config) and `venueScene: Int32Array` to `Frame` (sliced to `nVenues`).
- `venueScene[v]` is the lineage id of the live scene whose centroid has the highest cosine with venue v's taste-profile row (`s.venueProfile`, row v), or -1 when there are no scenes.
- **Tests:** a venue whose profile is built from cluster c's entities maps to the scene dominated by cluster c (tiny world after scenes form); `venueScene` is -1 before any scenes exist.
- Commit: `feat(sim): carry venue identity scenes and week length in frames`.

---

### Task 3: Scout and calibration in days

**Files:** modify `src/sim/scout.ts`, `src/sim/worker/host.ts` / `protocol.ts` (scout defaults), `scripts/calibrate.ts`, `src/ui/demo-config.ts`.

- **Scout:** `scoutCandidates`' `weeks` and the event `duration` stay in weeks; simulate `weeksToTicks(weeks, tpw)` ticks. Extend `scout.test.ts` with a `ticksPerWeek: 7` case.
- **Calibration:** `pnpm calibrate --london` reports per 10 weeks, i.e. 70 ticks when daily.
- **Demo config:** add `ticksPerWeek: 7` to `DEMO_CONFIG`. Re-tune `closeThreshold`, `closeAfterTicks` and `autoOpenScore` (in weeks) so 100 simulated weeks again give about 3–10 closures and a similar number of openings, with open venues never below about 60% of the start. Report before and after.
- **Timing:** report the time per daily tick on London (2,500 residents); it should be ≤ about 10 ms.
- Commit: `feat(ui): run the demo city on daily ticks` (plus `fix(sim): …` commits for any scout or calibration changes).

---

### Task 4: Pausable clock and day-based UI

**Files:**
- Create: `src/render/clock.ts` (with a test).
- Modify: `src/render/frame-store.ts`, `src/ui/useSimulation.ts`, `src/render/Crowd.tsx`, `src/render/effects/Effects.tsx`, `src/render/Landmarks.tsx`, `src/render/SceneAuras.tsx`, `src/render/DemandGlow.tsx`, `src/render/ScoutPins.tsx`, `src/ui/Hud.tsx`, `src/ui/TimelineBar.tsx`, `src/ui/Toolbar.tsx` (wording), plus any other component using `performance.now()` for animation.

- **`SimClock`** (pure, tested):
  - `now()` returns accumulated animation milliseconds;
  - `setPlaying(playing, realNow)` starts and stops accumulation;
  - `sync(realNow)` advances only while playing.

  It lives on `FrameStore` (e.g. `frames.current.clock`), and `useSimulation` toggles it in `play()`/`pause()`.
  - Advance it once per rendered frame from one place, e.g. a tiny `ClockDriver` in `CityCanvas` that calls `sync(performance.now())` in `useFrame` with an early priority.
  - **Every animation phase and effect timer uses `clock.now()`**, so a pause freezes walkers mid-step, waves mid-ring, pulses mid-pulse. Camera fly-to and UI hover feedback may keep using real time.
- **Crowd:** the per-tick night-out phase uses clock time; one tick is now one day.
  - Fewer residents go out each day: Monday is quiet, Saturday is busy.
  - The `outing-path` timing still fits inside one tick; check it reads well at 1 day per second.
- **Speeds:** `TimelineBar` speeds become **days per second: ½, 1, 2, 4** (label `day/s`), default **1**. The worker's min/max ticks-per-second already allow this; make sure `MIN_TICKS_PER_SECOND` ≤ 0.5.
- **Labels:**
  - The HUD shows "Week W · Fri", from `frame.tick` and `frame.ticksPerWeek` (Mon = day 0). The timeline label matches, and the slider still scrubs by tick (day).
  - Event wording ("for 3 weeks") stays correct, because durations are in weeks.
- **Venue identity colour:** `Landmarks` body emissive and roof band use `frame.venueScene[slot]`'s scene colour (fallback: the current neutral). The **sign** keeps using the dominant visitor scene. A small "identity versus tonight" difference now tells a story.
- **Struggling detection:** must use `weeksToTicks(graceTicks, ticksPerWeek)`. Update `isStruggling` and `diffFrames`' threshold args.
- [ ] **Step 1:** Implement, with TDD for the clock and any pure helpers such as a day-label function.
- [ ] **Step 2:** Run `pnpm test`, `tsc`, `lint` and `build`.
- [ ] **Step 3:** Make atomic commits, e.g.:
  - `feat(render): animate from a pausable clock so pause freezes the frame`
  - `feat(ui): show days and day-based speeds`
  - `feat(render): colour venues by their own scene and signs by tonight's crowd`

---

### Task 5: Browser check and docs (controller, with the user)

- [ ] **Browser checks:**
  - Pause mid-walk freezes everything; resume continues smoothly.
  - Weekdays are quieter and weekends busier.
  - Venues show identity versus tonight colours.
  - Scout still works.
  - No console errors.
- [ ] **Docs:** update `docs/pitch-and-demo.md` (glossary: tick = day in the demo), `docs/current-state.md` and the roadmap. Commit: `docs: record daily ticks, true pause and venue identity colours`.
