import { expect, it } from "vitest";
import { agentStreamError } from "@/agents/stream-error";

it("explains provider throttling without exposing its raw response", () => {
  const text = agentStreamError({ statusCode: 429, responseBody: "private provider details" });
  expect(text).toContain("rate limit");
  expect(text).toContain("minute");
  expect(text).not.toContain("private provider details");
});

it("keeps unexpected provider errors generic", () => {
  expect(agentStreamError(new Error("secret-bearing provider response"))).not.toContain("secret-bearing");
});
