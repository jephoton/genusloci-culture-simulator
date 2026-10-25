import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { type RaceContext, RaceContextSchema, raceHelperInstructions, raceHelperStream } from "@/agents/race-helper";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};

const context: RaceContext = {
  step: "result",
  artist: "Test Artist",
  venues: [{ letter: "A", name: "Venue One", kind: "club", area: "Soho", qlooFit: 100, regulars: 12 }],
  race: { firstNight: "Fri", nights: 3, nightsPlayed: 3, visits: [30], result: { winner: "A", futures: 3, consistent: true, rows: [{ letter: "A", min: 25, max: 31, wins: 3, hostVisitsWithoutEvent: 6, hostVisitsWithEvent: 36, visitsLostByVenuesNearby: 4 }] } },
};

describe("race helper", () => {
  it("grounds its instructions in the visitor's race and the model's limits", () => {
    const text = raceHelperInstructions("London", context);
    expect(text).toContain("Venue One");
    expect(text).toContain("not ticket sales");
    expect(text).toContain("1.5 km");
  });

  it("rejects contexts with too many venues or unknown steps", () => {
    expect(RaceContextSchema.safeParse(context).success).toBe(true);
    expect(RaceContextSchema.safeParse({ ...context, step: "close_venue" }).success).toBe(false);
    expect(RaceContextSchema.safeParse({ ...context, venues: Array(4).fill(context.venues[0]) }).success).toBe(false);
  });

  it("streams an answer with the race in the system instructions and no Qloo tools when Qloo is off", async () => {
    let prompt: unknown;
    let tools: unknown;
    const model = new MockLanguageModelV4({
      doStream: async (options) => {
        prompt = options.prompt;
        tools = options.tools;
        return { stream: simulateReadableStream({ chunks: [{ type: "text-start", id: "t" }, { type: "text-delta", id: "t", delta: "A won." }, { type: "text-end", id: "t" }, { type: "finish", finishReason: { unified: "stop", raw: undefined }, logprobs: undefined, usage }] as never[] }) };
      },
    });
    const messages: UIMessage[] = [{ id: "u1", role: "user", parts: [{ type: "text", text: "Why did A win?" }] }];
    const result = await raceHelperStream({ model, messages, city: "London", context, qloo: null });
    expect(await result.text).toBe("A won.");
    expect(JSON.stringify(prompt)).toContain("Venue One");
    expect(tools ?? []).toEqual([]);
  });
});
