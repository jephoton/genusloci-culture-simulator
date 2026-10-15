import { afterEach, expect, it, vi } from "vitest";
import { parseWorld, type World } from "@/world/schema";
import { executeBuildStage } from "./job-pipeline";
import { createBuildService, type BuildLedger, type BuildRepository } from "./jobs";

afterEach(() => vi.unstubAllEnvs());

it("resumes the real gather/assemble/heatmaps/equilibrate pipeline using only synthetic HTTP data", async () => {
  vi.stubEnv("QLOO_API_KEY", "synthetic-test-key");
  vi.stubEnv("QLOO_BASE_URL", "https://synthetic.invalid");
  let ledger: BuildLedger | null = null;
  let revision = 0;
  let output: World | undefined;
  let calls = 0;
  const repo: BuildRepository = {
    async read() { return { ledger: structuredClone(ledger), version: ledger ? String(revision) : null }; },
    async write(next, expected) {
      if (expected !== (ledger ? String(revision) : null)) throw new Error("CAS conflict");
      ledger = structuredClone(next); return String(++revision);
    },
    async publish(job) { output = parseWorld(job.payload.world); return "synthetic-output"; },
  };
  const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`;
  const fetch: typeof globalThis.fetch = async (input) => {
    const url = new URL(String(input));
    expect(url.hostname).toBe("synthetic.invalid");
    calls++;
    const type = url.searchParams.get("filter.type");
    const body = type === "urn:heatmap" ? { results: { heatmap: Array.from({ length: 45 }, (_, i) => ({
      location: { latitude: 51.5072 + (i % 5) * 0.001, longitude: -0.1276 + Math.floor(i / 5) * 0.001, geohash: `synthetic${i}` },
      query: { affinity: (i + 1) / 45, affinity_rank: (i + 1) / 45, popularity: 0.5 },
    })) } } : { results: { entities: type === "urn:entity:place" ? [1, 2].map((i) => ({
      entity_id: uuid(i), name: `Synthetic venue ${i}`, subtype: "urn:entity:place", popularity: 0.5,
      location: { lat: 51.5072 + i * 0.001, lon: -0.1276 },
      tags: [{ id: "urn:tag:ambience:qloo:lively", name: "Lively", type: "urn:tag:ambience:qloo" }],
    })) : [{ entity_id: uuid(999), name: "Synthetic musician", subtype: "urn:entity:artist", popularity: 0.5,
      tags: [{ id: "urn:tag:genre:music:jazz", name: "Jazz", type: "urn:tag:genre:music" }] }] } };
    return Response.json(body, { headers: { "X-Month-RateLimit-Remaining": String(5000 - calls) } });
  };
  let complete = false;
  for (let i = 0; i < 20; i++) {
    const service = createBuildService({ repo, execute: executeBuildStage, fetch, initialQuota: 5000 });
    const before = calls;
    const status = await service.advance("london");
    expect(calls - before).toBeLessThanOrEqual(4);
    expect(status.status).not.toBe("failed");
    expect(status.status).not.toBe("blocked");
    if (status.status === "completed") { complete = true; break; }
  }
  expect(complete).toBe(true);
  expect(output?.meta?.source).toBe("qloo");
  expect(output?.heatmaps.length).toBeGreaterThan(0);
  expect(output?.entities.some((e) => e.name === "Synthetic musician")).toBe(true);
  expect(calls).toBeLessThan(20);
  expect(ledger!.jobs.london.calls).toBe(calls);
  expect(ledger!.remaining).toBe(5000 - calls);
});
