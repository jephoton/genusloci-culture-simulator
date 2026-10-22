import { expect, it } from "vitest";
import { recommendedPrompts, promptCompletion } from "./prompt-completion";

it("extracts suggested questions without treating quoted venue names as prompts", () => {
  expect(recommendedPrompts('Alpha Club is called “The Lab”. Try “What if Alpha Club closes?” or ask **Show the busiest venues**.')).toEqual(["What if Alpha Club closes?", "Show the busiest venues"]);
  expect(recommendedPrompts("Suggested prompt: What if we open a cafe in Soho?\nOther facts.")).toEqual(["What if we open a cafe in Soho?"]);
  expect(recommendedPrompts("Try asking: `How do tastes evolve?`")).toEqual(["How do tastes evolve?"]);
  expect(recommendedPrompts("Try ‘What if King's Club closes?’")).toEqual(["What if King's Club closes?"]);
});

it("fills the first matching recommendation without sending or replacing unrelated drafts", () => {
  const prompts = ["Show the busiest venues", "What if Alpha Club closes?"];
  expect(promptCompletion("", prompts, 0, 0)).toBe(prompts[0]);
  expect(promptCompletion("what if", prompts, 7, 7)).toBe(prompts[1]);
  expect(promptCompletion("My own question", prompts, 15, 15)).toBeUndefined();
  expect(promptCompletion(prompts[0], prompts, prompts[0].length, prompts[0].length)).toBeUndefined();
});

it("preserves cursor movement and text selection", () => {
  expect(promptCompletion("Show", ["Show the busiest venues"], 2, 2)).toBeUndefined();
  expect(promptCompletion("Show", ["Show the busiest venues"], 0, 4)).toBeUndefined();
  expect(promptCompletion("Show", ["Show the busiest venues"], null, null)).toBeUndefined();
});
