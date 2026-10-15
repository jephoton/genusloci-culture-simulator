import { describe, expect, it } from "vitest";
import { createBuildService, type BuildLedger, type BuildRepository, type StageExecutor } from "./jobs";
import { createTransport } from "@/qloo/transport";

function fixture(execute: StageExecutor, quota = 1100) {
  let ledger: BuildLedger | null = null;
  let version = 0;
  const repo: BuildRepository = {
    async read() { return { ledger: structuredClone(ledger), version: ledger ? String(version) : null }; },
    async write(next, expected) {
      if (expected !== (ledger ? String(version) : null)) throw new Error("conflict");
      ledger = structuredClone(next); return String(++version);
    },
    async publish() { return "world-builds/test.world.json"; },
  };
  let now = 0;
  const service = () => createBuildService({ repo, execute, initialQuota: quota, fetch: async () => new Response("{}"), now: () => now });
  return { service, read: () => ledger!, advanceTime: () => { now += 130_000; }, nextMonth: () => { now += 32 * 24 * 60 * 60 * 1000; } };
}

describe("durable world builds", () => {
  it("resumes cached work across fresh service instances with bounded attempts", async () => {
    const f = fixture(async (_stage, job, c) => {
      for (let i = 0; i < 6; i++) {
        if (await c.cache.get(String(i)) === undefined) {
          await c.fetch("https://synthetic.invalid");
          await c.cache.set(String(i), i);
        }
      }
      return { ...job.payload, complete: true };
    });
    expect((await f.service().advance("london", 20)).stage).toBe("gather");
    expect(f.read().jobs.london.calls).toBe(4);
    expect((await f.service().advance("london", 20)).stage).toBe("heatmaps");
    expect(f.read().jobs.london.calls).toBe(6);
  });
  it("keeps 1000 calls in reserve and charges attempts before failures", async () => {
    const f = fixture(async (_s, _j, c) => { await c.fetch("https://synthetic.invalid"); return {}; }, 1000);
    expect((await f.service().advance("london", 20)).status).toBe("blocked");
    expect(f.read().jobs.london.calls).toBe(0);
    expect(f.read().remaining).toBe(1000);
  });
  it("persists failure and requires explicit retry", async () => {
    let fail = true;
    const f = fixture(async () => { if (fail) throw new Error("secret upstream body"); return {}; });
    expect((await f.service().advance("london", 20)).status).toBe("failed");
    expect((await f.service().advance("london", 20)).status).toBe("failed");
    expect(JSON.stringify(f.read())).not.toContain("secret upstream body");
    fail = false;
    expect((await f.service().advance("london", 20, true)).stage).toBe("heatmaps");
  });
  it("deduplicates competing workers using durable CAS", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const f = fixture(async () => { await gate; return {}; });
    const first = f.service().advance("london", 20);
    await new Promise((r) => setTimeout(r, 0));
    await expect(f.service().advance("singapore", 20)).rejects.toThrow("busy");
    release(); await first;
  });
  it("publishes only a completed job and deduplicates subsequent requests", async () => {
    const f = fixture(async () => ({}));
    for (let i = 0; i < 4; i++) await f.service().advance("london", 20);
    expect((await f.service().status("london"))?.status).toBe("completed");
    expect(f.read().jobs.london.output).toBe("world-builds/test.world.json");
    expect((await f.service().advance("london", 20)).status).toBe("completed");
  });
  it("fences an expired worker after another instance takes over", async () => {
    let release!: () => void;
    let runs = 0;
    const gate = new Promise<void>((r) => { release = r; });
    const f = fixture(async () => { if (++runs === 1) await gate; return { run: runs }; });
    const old = f.service().advance("london", 20);
    await new Promise((r) => setTimeout(r, 0));
    f.advanceTime();
    await f.service().advance("london", 20);
    release();
    await expect(old).rejects.toThrow("busy");
    expect(f.read().jobs.london.stage).toBe("heatmaps");
    expect(f.read().jobs.london.payload).toEqual({ run: 2 });
  });
  it("preserves deliberate yield through Qloo transport network-error wrapping", async () => {
    const f = fixture(async (_s, _j, c) => {
      const transport = createTransport({ apiKey: "synthetic", cache: c.cache, fetch: c.fetch, maxRetries: 0, perSecond: 100 });
      for (let i = 0; i < 6; i++) await transport.get("/synthetic", { i }, (value) => value);
      return {};
    });
    expect((await f.service().advance("london", 20)).status).toBe("ready");
    expect(f.read().jobs.london.calls).toBe(4);
    expect((await f.service().advance("london", 20)).stage).toBe("heatmaps");
    expect(f.read().jobs.london.calls).toBe(6);
  });
  it("counts network errors against quota before failure and limits explicit retries", async () => {
    const f = fixture(async (_s, _j, c) => { await c.fetch("https://synthetic.invalid"); throw new Error("synthetic failure"); });
    for (let i = 0; i < 3; i++) await f.service().advance("london", 20, true);
    expect((await f.service().advance("london", 20, true)).status).toBe("failed");
    expect(f.read().jobs.london.calls).toBe(3);
    expect(f.read().remaining).toBe(1097);
  });
  it("rejects unknown cities and invalid call budgets before storage", async () => {
    const f = fixture(async () => ({}));
    await expect(f.service().advance("../secret", 20)).rejects.toThrow("city");
    await expect(f.service().advance("london", 1)).rejects.toThrow("budget");
  });
  it("stops permanently at the per-build call limit", async () => {
    const f = fixture(async (_s, _j, c) => { for (let i = 0; i < 30; i++) await c.fetch("https://synthetic.invalid"); return {}; });
    for (let i = 0; i < 5; i++) await f.service().advance("london", 20);
    expect((await f.service().advance("london", 20)).status).toBe("blocked");
    expect(f.read().jobs.london.calls).toBe(20);
  });
  it("blocks monthly rollover until explicit current-period quota reconciliation", async () => {
    const f = fixture(async (_s, _j, c) => { await c.fetch("https://synthetic.invalid"); return {}; });
    await f.service().advance("london", 20);
    f.nextMonth();
    expect((await f.service().advance("singapore", 20)).status).toBe("blocked");
    await expect(f.service().reconcileQuota(5000, "1970-01")).rejects.toThrow("period");
    await f.service().reconcileQuota(5000, "1970-02");
    expect((await f.service().advance("singapore", 20, true)).stage).toBe("heatmaps");
    expect(f.read().remaining).toBe(4999);
  });
  it("validates quota figures and refuses reconciliation during an active lease", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const f = fixture(async () => { await gate; return {}; });
    await expect(f.service().reconcileQuota(10001, "1970-01")).rejects.toThrow("quota");
    await expect(f.service().reconcileQuota(-1, "1970-01")).rejects.toThrow("quota");
    const pending = f.service().advance("london", 20);
    await new Promise((r) => setTimeout(r, 0));
    await expect(f.service().reconcileQuota(5000, "1970-01")).rejects.toThrow("busy");
    release(); await pending;
  });
});
