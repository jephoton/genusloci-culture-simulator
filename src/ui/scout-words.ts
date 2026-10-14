/** What the verdict needs from one scouted spot (a ScoutResult plus its pin letter). */
export type ScoutLine = { letter: string; turnout: number; newFans: number; scenes: number[]; neighbourLoss: number };

/** Pin letters in the order the spots were proposed: A–C from the tool, D for the player's own. */
export function pinLetter(index: number): string {
  return String.fromCharCode(65 + index);
}

/** Below this share of the night's turnout, the loss to nearby venues is "little"; below HEAVY, "some". */
const LIGHT = 0.2;
const HEAVY = 0.5;
/** Top two within this fraction of turnout are a close call. */
const CLOSE = 0.1;

/** How much trade a night takes from nearby venues, relative to its own turnout. */
export function harmWord(turnout: number, neighbourLoss: number): "little" | "some" | "a lot" {
  if (neighbourLoss <= 0) return "little";
  const ratio = neighbourLoss / Math.max(1, turnout);
  return ratio < LIGHT ? "little" : ratio < HEAVY ? "some" : "a lot";
}

const scenesPhrase = (n: number) => (n === 0 ? "reaches no scenes yet" : `reaches ${n} ${n === 1 ? "scene" : "scenes"}`);
const costPhrase = (l: ScoutLine) => {
  const harm = harmWord(l.turnout, l.neighbourLoss);
  return harm === "little" ? "costs nearby venues little" : harm === "some" ? "costs nearby venues some trade" : null;
};
const takesPhrase = (l: ScoutLine) => `it takes ${Math.round(l.neighbourLoss)} visits from nearby venues`;

/**
 * One line summing up a ranked scout (best first), e.g. "B is the strongest night: 38% more turnout
 * than A, reaches 3 scenes, and costs nearby venues little."
 */
export function scoutVerdict(ranked: ScoutLine[]): string {
  if (ranked.length === 0) return "";
  const [best, next] = ranked;
  if (ranked.every((l) => l.turnout <= 0)) return "None of these spots draws a crowd yet. Try another headliner.";
  const cost = costPhrase(best);
  const scenes = scenesPhrase(best.scenes.length);

  if (!next) {
    const draws = `${best.letter} draws ${Math.round(best.turnout)} visits`;
    return cost ? `${draws}, ${scenes}, and ${cost}.` : `${draws} and ${scenes}, but ${takesPhrase(best)}.`;
  }

  const gap = next.turnout > 0 ? (best.turnout - next.turnout) / next.turnout : Infinity;
  const pct = `${Math.round(Math.abs(gap) * 100)}%`;

  if (Math.abs(gap) < CLOSE) {
    if (gap < 0) {
      return `A close call: ${best.letter} and ${next.letter} draw about the same crowd, and ${best.letter} is easier on nearby venues.`;
    }
    // Under 1% rounds to "0%": say they tie rather than "edges … by 0%".
    const lead =
      Math.round(gap * 100) === 0
        ? `A close call: ${best.letter} and ${next.letter} draw the same crowd, and ${best.letter} ${scenes}`
        : `A close call: ${best.letter} edges ${next.letter} by ${pct} on turnout and ${scenes}`;
    if (cost) return `${lead}; either would make a good night.`;
    return next.neighbourLoss < best.neighbourLoss
      ? `${lead}, but ${takesPhrase(best)}; ${next.letter} may be the safer pick.`
      : `${lead}, but ${takesPhrase(best)}, and ${next.letter} would take as much or more.`;
  }

  if (gap < 0) {
    const kinder = `${best.letter} is the kinder night: ${pct} less turnout than ${next.letter}, but it ${scenes}`;
    return cost ? `${kinder} and ${cost}.` : `${kinder}.`;
  }

  const lead = gap === Infinity ? `it draws a crowd where ${next.letter} draws none` : `${pct} more turnout than ${next.letter}`;
  return cost
    ? `${best.letter} is the strongest night: ${lead}, ${scenes}, and ${cost}.`
    : `${best.letter} is the strongest night: ${lead} and ${scenes}, but ${takesPhrase(best)}.`;
}
