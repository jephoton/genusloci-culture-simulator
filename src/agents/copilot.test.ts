import { simulateReadableStream, type UIMessage } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { copilotInstructions, copilotStream, QLOO_CALLS_PER_REQUEST, qlooTools } from "@/agents/copilot";
import type { QlooClient } from "@/qloo/client";
import { QlooBudgetError } from "@/qloo/transport";

const usage = {
  inputTokens: { total: 1, noCache: 1, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 1, text: 1, reasoning: undefined },
};
const finish = (unified: "stop" | "tool-calls") => ({ type: "finish" as const, finishReason: { unified, raw: undefined }, logprobs: undefined, usage });
const toolCall = (toolName: string, input: unknown) => ({ type: "tool-call" as const, toolCallId: `call-${toolName}`, toolName, input: JSON.stringify(input) });
const text = (t: string) => [{ type: "text-start" as const, id: "t" }, { type: "text-delta" as const, id: "t", delta: t }, { type: "text-end" as const, id: "t" }];

/** A mock model that plays back one scripted step per call. */
function scripted(steps: unknown[][]) {
  let i = 0;
  return new MockLanguageModelV4({
    doStream: async () => ({ stream: simulateReadableStream({ chunks: steps[Math.min(i++, steps.length - 1)] as never[] }) }),
  });
}

const fakeQloo = () => {
  const calls: string[] = [];
  const q = {
    search: async (name: string) => {
      calls.push(`search:${name}`);
      return [{ id: "00000000-0000-4000-8000-000000000001", name: "Test Artist", type: "urn:entity:artist", popularity: 0.91, tags: [] }];
    },
    tagAffinities: async () => {
      calls.push("taste");
      return [{ id: "urn:tag:genre:music:techno", name: "Techno" }];
    },
  } as unknown as QlooClient;
  return { q, calls };
};

const userMessage = (t: string): UIMessage[] => [{ id: "u1", role: "user", parts: [{ type: "text", text: t }] }];

describe("copilotStream", () => {
  it("runs server Qloo tools inside the loop, then answers", async () => {
    const { q, calls } = fakeQloo();
    const model = scripted([[toolCall("qloo_search", { name: "Test Artist" }), finish("tool-calls")], [...text("They're big here."), finish("stop")]]);
    const result = await copilotStream({ model, messages: userMessage("who is Test Artist?"), city: "London", qloo: q });
    expect(await result.text).toBe("They're big here.");
    expect(calls).toEqual(["search:Test Artist"]);
    const firstCall = model.doStreamCalls[0];
    expect(JSON.stringify(firstCall.prompt)).toContain("London");
    expect(firstCall.tools?.map((t) => t.name).sort()).toEqual(["apply", "city_summary", "find", "qloo_search", "qloo_taste", "scene", "venue", "venues", "what_if"]);
  });

  it("stops at a browser tool call, leaving it for the client to run", async () => {
    const model = scripted([[toolCall("city_summary", {}), finish("tool-calls")], [...text("never"), finish("stop")]]);
    const result = await copilotStream({ model, messages: userMessage("how is the city?"), city: "London", qloo: null });
    const calls = await result.toolCalls;
    expect(calls.map((c) => c?.toolName)).toEqual(["city_summary"]);
    expect(model.doStreamCalls).toHaveLength(1);
    expect(await result.text).toBe("");
  });
});

describe("qlooTools", () => {
  it("caps Qloo calls per request and turns failures into messages", async () => {
    const { q } = fakeQloo();
    const tools = qlooTools(q);
    const opts = { toolCallId: "x", messages: [] } as never;
    for (let i = 0; i < QLOO_CALLS_PER_REQUEST; i++) await tools.qloo_search.execute!({ name: "a" }, opts);
    expect(await tools.qloo_search.execute!({ name: "a" }, opts)).toHaveProperty("error");

    const broke = qlooTools({ search: async () => { throw new QlooBudgetError(10, 1000); } } as unknown as QlooClient);
    expect(await broke.qloo_taste.execute!({ name: "a" }, opts)).toEqual({ error: expect.stringMatching(/paused/) });
  });

  it("writes city-specific instructions", () => {
    expect(copilotInstructions("Singapore")).toContain("Singapore");
  });
});
