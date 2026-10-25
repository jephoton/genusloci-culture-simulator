import { afterEach, expect, it, vi } from "vitest";
import { GET } from "./route";
import { PROVIDERS } from "@/agents/providers";

afterEach(() => vi.unstubAllEnvs());

it("reports no configured AI without sending a provider request or returning key material", async () => {
  for (const p of PROVIDERS) vi.stubEnv(p.keyVar, "");
  const response = await GET();
  expect(await response.json()).toEqual({ configured: false });
  expect(response.headers.get("Cache-Control")).toContain("no-store");
});

it("reports configuration without exposing the configured secret", async () => {
  for (const p of PROVIDERS) vi.stubEnv(p.keyVar, "");
  vi.stubEnv("GROQ_API_KEY", "test-secret-never-return");
  expect(await (await GET()).json()).toEqual({ configured: true });
});
