import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { nameScenes, namingPrompt } from "@/agents/naming";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const modelReturning = (json: unknown) =>
  new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text: JSON.stringify(json) }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
  });

const body = {
  city: "London",
  scenes: [
    { id: 3, tastes: ["Night club", "Ghetts"], homes: ["Soho"] },
    { id: 7, tastes: ["Museum", "Quiet"], homes: ["Bloomsbury"], parent: "Gallery regulars" },
  ],
  taken: ["Theatre crowd"],
};

describe("scene naming", () => {
  it("prompts with the city, tastes, homes, parents and taken names", () => {
    const p = namingPrompt(body);
    for (const s of ["London", "Night club, Ghetts", "Soho", 'split from "Gallery regulars"', "Theatre crowd"]) expect(p).toContain(s);
  });

  it("keeps only names for scenes that were asked for, tidied", async () => {
    const model = modelReturning({
      scenes: [
        { id: 3, name: "  Late-night   grime crowd " },
        { id: 99, name: "Stray" },
        { id: 7, name: "" },
      ],
    });
    expect(await nameScenes(model, body)).toEqual([{ id: 3, name: "Late-night grime crowd" }]);
  });
});
