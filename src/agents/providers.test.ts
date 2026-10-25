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
    const chain = providerChain("small", { GOOGLE_GENERATIVE_AI_API_KEY: "google", GROQ_API_KEY: "g", DEEPSEEK_API_KEY: "d", GROQ_SMALL_MODEL: "custom-small" });
    expect(chain.map((c) => [c.name, c.modelId])).toEqual([
      ["gemini", "gemini-3.5-flash-lite"],
      ["groq", "custom-small"],
    ]);
    expect(modelFor("copilot", {})).toBeNull();
  });

  it("uses tested Gemini Flash-Lite before Groq and excludes other vendors from automatic chat fallback", () => {
    const chain = providerChain("copilot", { GOOGLE_GENERATIVE_AI_API_KEY: "google", GROQ_API_KEY: "groq", DEEPSEEK_API_KEY: "deepseek", OPENROUTER_API_KEY: "router", CEREBRAS_API_KEY: "cerebras" });
    expect(chain.map((p) => [p.name, p.modelId])).toEqual([["gemini", "gemini-3.5-flash-lite"], ["groq", "openai/gpt-oss-120b"]]);
  });
});

describe("fallbackModel", () => {
  it("falls back if a provider only thinks or finishes without usable output", async () => {
    type Part = Awaited<ReturnType<MockLanguageModelV4["doStream"]>>["stream"] extends ReadableStream<infer T> ? T : never;
    const cases: Part[][] = [
      [{ type: "reasoning-start" as const, id: "r" }, { type: "error" as const, error: new Error("failed during thinking") }],
      [{ type: "finish" as const, finishReason: { unified: "stop" as const, raw: undefined }, usage }],
    ];
    for (const chunks of cases) {
      const first = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks }) }) });
      const second = textModel("usable answer");
      const result = streamText({ model: fallbackModel([first, second]), prompt: "hello", maxRetries: 0, onError: () => {} });
      expect(await result.text).toBe("usable answer");
    }
  });

  it("reports empty output from the last provider as failure instead of a successful blank answer", async () => {
    const empty = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks: [{ type: "finish", finishReason: { unified: "stop", raw: undefined }, usage, logprobs: undefined }] }) }) });
    const errors: unknown[] = [];
    const result = streamText({ model: fallbackModel([empty]), prompt: "hello", maxRetries: 0, onError: (event) => { errors.push(event.error); } });
    await result.consumeStream();
    expect(errors).toHaveLength(1);
  });

  it("tries Groq when Gemini returns an error chunk before any usable stream output", async () => {
    const first = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks: [{ type: "stream-start", warnings: [] }, { type: "error", error: new Error("429") }] }) }) });
    const second = textModel("Groq answered");
    const result = streamText({ model: fallbackModel([first, second]), prompt: "hello", maxRetries: 0 });
    expect(await result.text).toBe("Groq answered");
    expect(second.doStreamCalls).toHaveLength(1);
  });

  it("does not replay a stream after a tool has begun", async () => {
    const first = new MockLanguageModelV4({ doStream: async () => ({ stream: simulateReadableStream({ chunks: [{ type: "tool-input-start", id: "tool-1", toolName: "city_summary" }, { type: "error", error: new Error("connection lost") }] }) }) });
    const second = textModel("must not run");
    const result = streamText({ model: fallbackModel([first, second]), prompt: "hello", maxRetries: 0, onError: () => {} });
    await result.consumeStream();
    expect(second.doStreamCalls).toHaveLength(0);
  });
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
