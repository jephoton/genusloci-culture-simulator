import { describe, expect, it } from "vitest";
import type { UIMessage } from "ai";
import { compactMessages } from "@/agents/copilot-context";
import { providerRetrySeconds, retrySecondsFromMessage } from "@/agents/stream-error";

const user = (id: string, text: string): UIMessage => ({ id, role: "user", parts: [{ type: "text", text }] });
describe("bounded co-pilot context", () => {
  it("drops entire old turns while keeping current tool inputs and results paired", () => {
    const active = [user("new", "explain"), { id: "a", role: "assistant", parts: [{ type: "tool-apply", toolCallId: "apply-1", state: "output-available", input: { actions: [] }, output: { applied: ["done"] } }] } as UIMessage];
    const compact = compactMessages([user("old", "x".repeat(5000)), { id: "old-a", role: "assistant", parts: [{ type: "text", text: "earlier" }] }, ...active], 500);
    expect(compact).toEqual(active);
  });
  it("preserves a large current turn rather than silently corrupting tool facts", () => {
    const messages = [user("current", "x".repeat(2000))];
    expect(compactMessages(messages, 100)).toEqual(messages);
  });
  it("removes invisible reasoning and transport metadata from retained history", () => {
    const messages = [user("u", "hi"), { id: "a", role: "assistant", parts: [{ type: "reasoning", text: "private chain" }, { type: "text", text: "answer", providerMetadata: { huge: "x".repeat(1000) } }] } as UIMessage];
    expect(JSON.stringify(compactMessages(messages))).not.toContain("private chain");
    expect(JSON.stringify(compactMessages(messages))).not.toContain("providerMetadata");
    expect(JSON.stringify(compactMessages(messages))).toContain("answer");
  });
});
describe("provider cooldown", () => {
  it("honors retry-after seconds, HTTP dates and a conservative missing-header fallback", () => {
    expect(providerRetrySeconds({ statusCode: 429, responseHeaders: { "retry-after": "123" } })).toBe(123);
    expect(providerRetrySeconds({ statusCode: 429, responseHeaders: { "retry-after": new Date(120000).toUTCString() } }, 60000)).toBe(60);
    expect(providerRetrySeconds({ statusCode: 429 })).toBe(60);
    expect(providerRetrySeconds({ statusCode: 401 })).toBeNull();
  });
  it("reads only a sanitized cooldown marker, never arbitrary provider text", () => {
    expect(retrySecondsFromMessage("Provider rate limit. [retry-after:123]")).toBe(123);
    expect(retrySecondsFromMessage('{"retryAfter":42,"error":"slow"}')).toBe(42);
    expect(retrySecondsFromMessage("private provider error")).toBeNull();
  });
});
