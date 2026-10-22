import { expect, it, vi } from "vitest";
import { isDirectLocalCommand, runQuestionWithFallback } from "./lab-routing";

it("tries AI before invoking the deterministic parser", async () => {
  const local = vi.fn(async () => "local");
  const ai = vi.fn(async () => true);
  expect(await runQuestionWithFallback(ai, local)).toEqual({ source: "ai" });
  expect(local).not.toHaveBeenCalled();
});

it("falls back once when the provider chain fails or throws", async () => {
  for (const ai of [async () => false, async () => { throw new Error("providers unavailable"); }]) {
    const local = vi.fn(async () => "local answer");
    expect(await runQuestionWithFallback(ai, local)).toEqual({ source: "local", result: "local answer" });
    expect(local).toHaveBeenCalledTimes(1);
  }
});

it("keeps explicit local writes out of the provider retry path without treating comparisons as writes", () => {
  for (const text of ["close Alpha Club", "please open a cafe in Soho", "raise rent by 20% in Soho", "apply that", "make that change live!"]) expect(isDirectLocalCommand(text)).toBe(true);
  for (const text of ["Show the busiest venues", "what if Alpha Club closes?", "close Alpha Club?", "open a cafe in Soho?!", "how do tastes evolve?"]) expect(isDirectLocalCommand(text)).toBe(false);
});
