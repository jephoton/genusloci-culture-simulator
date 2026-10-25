import type { EventOutcome } from "@/sim/events";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
export const NIGHT_OPTIONS = [1, 3, 7] as const;
export const LETTERS = ["A", "B", "C"] as const;

/** The first tick after `tick` that falls on `weekday` (daily ticks; tick % 7 is the weekday, Monday = 0). */
export function raceStartTick(tick: number, weekday: number): number {
  return tick + 1 + ((weekday - ((tick + 1) % 7) + 7) % 7);
}

export type VenueRaceRow = {
  /** Event visitors in the race that was played (future 1). */
  watched: number;
  min: number;
  max: number;
  /** Futures (of all) in which this venue drew the most event visitors outright. */
  wins: number;
  /** The venue's own visits over the same nights without the event, and with it (event included). */
  usual: number;
  withEvent: number;
  /** Visits lost by other venues within 1 km. */
  neighbourLoss: number;
};

export type VenueRaceSummary = {
  rows: VenueRaceRow[];
  /** Candidate with the most event visitors in the played race; null on a tie. */
  winner: number | null;
  futures: number;
  /** Whether the same venue won outright in every future. */
  consistent: boolean;
};

/** `runs[f][c]`: candidate c's outcome in seeded future f (future 0 is the one played on screen). */
export function summariseRace(runs: EventOutcome[][]): VenueRaceSummary {
  const n = runs[0]?.length ?? 0;
  const leader = (outcomes: EventOutcome[]) => {
    const best = Math.max(...outcomes.map((o) => o.turnout));
    const top = outcomes.flatMap((o, c) => (o.turnout === best ? [c] : []));
    return top.length === 1 ? top[0] : null;
  };
  const leaders = runs.map(leader);
  const rows = Array.from({ length: n }, (_, c): VenueRaceRow => {
    const per = runs.map((r) => r[c]);
    return {
      watched: per[0].turnout,
      min: Math.min(...per.map((o) => o.turnout)),
      max: Math.max(...per.map((o) => o.turnout)),
      wins: leaders.filter((l) => l === c).length,
      usual: per[0].hostBaseline ?? 0,
      withEvent: per[0].hostWithEvent ?? 0,
      neighbourLoss: per[0].neighbourLoss,
    };
  });
  const winner = runs.length ? leaders[0] : null;
  return { rows, winner, futures: runs.length, consistent: winner !== null && leaders.every((l) => l === winner) };
}
