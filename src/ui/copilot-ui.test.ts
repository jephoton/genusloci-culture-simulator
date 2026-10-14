import type { UIMessage } from "ai";
import { describe, expect, it } from "vitest";
import { friendlyError, toolLabel } from "@/ui/CopilotPanel";
import { recentMessages, toolCallsThisTurn } from "@/ui/useCopilot";

const msg = (i: number, role: "user" | "assistant"): UIMessage => ({ id: String(i), role, parts: [] });

describe("recentMessages", () => {
  it("keeps short conversations whole and cuts long ones at a user turn", () => {
    const short = [msg(0, "user"), msg(1, "assistant")];
    expect(recentMessages(short, 4)).toBe(short);
    const long = [msg(0, "user"), msg(1, "assistant"), msg(2, "assistant"), msg(3, "user"), msg(4, "assistant")];
    expect(recentMessages(long, 4).map((m) => m.id)).toEqual(["3", "4"]);
  });
});

describe("toolCallsThisTurn", () => {
  it("counts tool parts since the last user message", () => {
    const tool = { type: "tool-find", toolCallId: "x", state: "output-available", input: {}, output: {} };
    const messages = [
      { id: "1", role: "user", parts: [] },
      { id: "2", role: "assistant", parts: [tool, tool] },
      { id: "3", role: "user", parts: [] },
      { id: "4", role: "assistant", parts: [tool, { type: "text", text: "hi" }] },
    ] as unknown as UIMessage[];
    expect(toolCallsThisTurn(messages)).toBe(1);
  });
});

describe("co-pilot panel words", () => {
  it("labels tool steps in plain English", () => {
    expect(toolLabel({ type: "tool-what_if", state: "output-available", input: { weeks: 12 } })).toBe("Simulated 12 weeks, with and without the change");
    expect(toolLabel({ type: "tool-find", input: { query: "Fabric" } })).toBe("Looked up “Fabric”");
    expect(toolLabel({ type: "tool-qloo_taste", input: { name: "Ghetts" } })).toBe("Asked Qloo what “Ghetts” fans like");
  });

  it("shows the route's error message when it sent one", () => {
    expect(friendlyError(new Error(JSON.stringify({ error: "The co-pilot is offline" })))).toBe("The co-pilot is offline");
    expect(friendlyError(new Error("network down"))).toBe("network down");
  });
});
