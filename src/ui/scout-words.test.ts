import { describe, expect, it } from "vitest";
import { harmWord, pinLetter, scoutVerdict, type ScoutLine } from "@/ui/scout-words";

const line = (letter: string, turnout: number, scenes: number, neighbourLoss: number, newFans = 0): ScoutLine => ({
  letter,
  turnout,
  newFans,
  scenes: Array.from({ length: scenes }, (_, i) => i),
  neighbourLoss,
});

describe("pinLetter", () => {
  it("letters pins A to D", () => {
    expect([0, 1, 2, 3].map(pinLetter)).toEqual(["A", "B", "C", "D"]);
  });
});

describe("harmWord", () => {
  it("grades the loss to nearby venues against the night's own turnout", () => {
    expect(harmWord(100, 5)).toBe("little");
    expect(harmWord(100, 30)).toBe("some");
    expect(harmWord(100, 80)).toBe("a lot");
    expect(harmWord(0, 0)).toBe("little");
  });
});

describe("scoutVerdict", () => {
  it("names a clear winner, its lead over the runner-up, its reach and its cost", () => {
    expect(scoutVerdict([line("B", 138, 3, 4), line("A", 100, 2, 10)])).toBe(
      "B is the strongest night: 38% more turnout than A, reaches 3 scenes, and costs nearby venues little.",
    );
  });

  it("calls a close call when the top two are within 10% on turnout", () => {
    expect(scoutVerdict([line("C", 105, 1, 20), line("A", 100, 4, 5)])).toBe(
      "A close call: C edges A by 5% on turnout and reaches 1 scene; either would make a good night.",
    );
  });

  it("in a close call that hurts neighbours, only calls the runner-up safer if it is", () => {
    expect(scoutVerdict([line("A", 105, 2, 90), line("B", 100, 2, 20)])).toBe(
      "A close call: A edges B by 5% on turnout and reaches 2 scenes, but it takes 90 visits from nearby venues; B may be the safer pick.",
    );
    expect(scoutVerdict([line("A", 105, 2, 90), line("B", 100, 2, 120)])).toBe(
      "A close call: A edges B by 5% on turnout and reaches 2 scenes, but it takes 90 visits from nearby venues, and B would take as much or more.",
    );
  });

  it("warns when the winner takes a lot of trade from nearby venues", () => {
    expect(scoutVerdict([line("A", 200, 2, 150), line("D", 120, 2, 10)])).toBe(
      "A is the strongest night: 67% more turnout than D and reaches 2 scenes, but it takes 150 visits from nearby venues.",
    );
  });

  it("explains a winner that draws fewer people but hurts neighbours less", () => {
    expect(scoutVerdict([line("B", 80, 2, 0), line("A", 100, 3, 90)])).toBe(
      "B is the kinder night: 20% less turnout than A, but it reaches 2 scenes and costs nearby venues little.",
    );
  });

  it("handles a single spot and an empty city", () => {
    expect(scoutVerdict([line("D", 50, 0, 0)])).toBe("D draws 50 visits, reaches no scenes yet, and costs nearby venues little.");
    expect(scoutVerdict([line("A", 0, 0, 0), line("B", 0, 0, 0)])).toBe("None of these spots draws a crowd yet. Try another headliner.");
    expect(scoutVerdict([])).toBe("");
  });
});
