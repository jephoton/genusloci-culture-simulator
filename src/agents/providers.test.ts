import { generateText, simulateReadableStream, streamText } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { fallbackModel, modelFor, providerChain } from "@/agents/providers";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

function textModel(text: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => ({ content: [{ type: "text", text }], finishReason: { unified: "stop", raw: undefined }, usage, warnings: [] }),
    doStream: async () => ({
      stream: simulateReadableStream({
        chunks: [
          { type: "text-start", id: "t" },
          { type: "text-delta", id: "t", delta: text },
          { type: "text-end", id: "t" },
          { type: "finish", finishReason: { unified: "stop", raw: undefined }, logprobs: undefined, usage },
        ],
      }),
    }),
  });
}

function failingModel(message: string) {
  return new MockLanguageModelV4({
    doGenerate: async () => {
      throw new Error(message);
    },
    doStream: async () => {
      throw new Error(message);
    },
  });
}

describe("providerChain", () => {
  it("includes only providers with keys, in priority order, honouring model overrides", () => {
    expect(providerChain("copilot", {})).toEqual([]);
    const chain = providerChain("small", { GROQ_API_KEY: "g", DEEPSEEK_API_KEY: "d", GROQ_SMALL_MODEL: "custom-small" });
    expect(chain.map((c) => [c.name, c.modelId])).toEqual([
      ["deepseek", "deepseek-v4-flash"],
      ["groq", "custom-small"],
    ]);
    expect(modelFor("copilot", {})).toBeNull();
  });
});

describe("fallbackModel", () => {
  it("falls through failing providers for generate and stream", async () => {
    const failures: number[] = [];
    const model = fallbackModel([failingModel("429"), failingModel("503"), textModel("hello")], (i) => failures.push(i));
    const g = await generateText({ model, prompt: "hi", maxRetries: 0 });
    expect(g.text).toBe("hello");
    expect(failures).toEqual([0, 1]);

    const s = streamText({ model, prompt: "hi", maxRetries: 0 });
    expect(await s.text).toBe("hello");
  });

  it("uses the first model when it works and rethrows when all fail", async () => {
    const second = textModel("second");
    expect((await generateText({ model: fallbackModel([textModel("first"), second]), prompt: "x", maxRetries: 0 })).text).toBe("first");
    expect(second.doGenerateCalls).toHaveLength(0);
    await expect(generateText({ model: fallbackModel([failingModel("a"), failingModel("b")]), prompt: "x", maxRetries: 0 })).rejects.toThrow(/b/);
  });
});
