import { randomUUID } from "node:crypto";
import { CITIES } from "@/geo/cities";
import type { QlooCache } from "@/qloo/cache";

export const BUILD_STAGES = ["gather", "heatmaps", "equilibrate", "publish"] as const;
export type BuildStage = typeof BUILD_STAGES[number];
export interface BuildJob {
  city: string;
  id: string;
  stage: BuildStage;
  status: "ready" | "running" | "failed" | "blocked" | "completed";
  calls: number;
  maxCalls: number;
  failures: number;
  updatedAt: string;
  error?: string;
  output?: string;
  cache: Record<string, unknown>;
  payload: Record<string, unknown>;
}
export interface BuildLedger {
  version: 1;
  /** Conservative monthly remaining estimate; null disables network work. */
  remaining: number | null;
  /** UTC month (YYYY-MM) the remaining estimate belongs to; a new month blocks network work until reconciled. */
  quotaPeriod?: string;
  lease?: { owner: string; expiresAt: number };
  jobs: Record<string, BuildJob>;
}
export interface BuildRepository {
  read(): Promise<{ ledger: BuildLedger | null; version: string | null }>;
  /** Compare-and-swap, including create-if-absent when version is null. */
  write(ledger: BuildLedger, version: string | null): Promise<string>;
  /** Immutable output; visibility is committed by the ledger's CAS, never by this write. */
  publish(job: BuildJob): Promise<string>;
}
export type StageExecutor = (stage: Exclude<BuildStage, "publish">, job: BuildJob, controls: {
  cache: QlooCache;
  fetch: typeof globalThis.fetch;
}) => Promise<Record<string, unknown>>;
export class BuildConflict extends Error { constructor() { super("World build is busy; try again after the lease expires"); } }
class BuildYield extends Error {}
class BuildBudget extends Error {}

export function publicBuildStatus(job: BuildJob) {
  const { city, id, stage, status, calls, maxCalls, failures, updatedAt, error } = job;
  return { city, id, stage, status, calls, maxCalls, failures, updatedAt, ...(error ? { error } : {}) };
}

export function createBuildService(options: {
  repo: BuildRepository;
  execute: StageExecutor;
  initialQuota?: number;
  budgetFloor?: number;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  const floor = Math.max(1000, Number.isFinite(options.budgetFloor) ? options.budgetFloor! : 1000);
  const cityValid = (city: string) => Object.hasOwn(CITIES, city);
  const period = () => new Date(now()).toISOString().slice(0, 7);
  return {
    /**
     * Records the operator's reading of the current month's remaining Qloo quota (e.g. from the Qloo
     * dashboard or a response header), so builds can resume after a month rollover. It replaces the
     * estimate outright: other Qloo consumers make any carried-over figure unreliable. Refused while
     * a build holds the lease.
     */
    async reconcileQuota(remaining: number, forPeriod: string) {
      if (!Number.isInteger(remaining) || remaining < 0 || remaining > 10_000) throw new Error("Remaining quota must be an integer from 0 to 10000");
      if (forPeriod !== period()) throw new Error(`Quota can only be reconciled for the current period (${period()})`);
      const snapshot = await options.repo.read();
      const ledger: BuildLedger = snapshot.ledger ?? { version: 1, remaining: null, jobs: {} };
      if (ledger.lease && ledger.lease.expiresAt > now()) throw new BuildConflict();
      ledger.remaining = remaining;
      ledger.quotaPeriod = forPeriod;
      await options.repo.write(ledger, snapshot.version);
      return { remaining, period: forPeriod };
    },
    /** The ledger's quota estimate and the month it belongs to, next to the current month. */
    async quota() {
      const { ledger } = await options.repo.read();
      return { remaining: ledger?.remaining ?? null, period: ledger?.quotaPeriod ?? null, currentPeriod: period(), floor };
    },
    async status(city: string) {
      if (!cityValid(city)) throw new Error("Unsupported city");
      const { ledger } = await options.repo.read();
      const job = ledger?.jobs[city];
      return job ? publicBuildStatus(job) : null;
    },
    async advance(city: string, maxCalls = 180, retry = false) {
      if (!cityValid(city)) throw new Error("Unsupported city");
      if (!Number.isInteger(maxCalls) || maxCalls < 20 || maxCalls > 180) throw new Error("Call budget must be an integer from 20 to 180");
      const owner = randomUUID();
      const snapshot = await options.repo.read();
      let version = snapshot.version;
      const quota = options.initialQuota;
      const ledger: BuildLedger = snapshot.ledger ?? {
        version: 1, remaining: Number.isInteger(quota) && quota! >= floor ? quota! : null, jobs: {},
      };
      // The environment estimate only seeds an empty ledger; it never replenishes an existing one.
      if (ledger.remaining === null && ledger.quotaPeriod === undefined && Number.isInteger(quota) && quota! >= floor) ledger.remaining = quota!;
      // Ledgers from before periods were tracked belong to the month they're first seen in.
      if (ledger.remaining !== null) ledger.quotaPeriod ??= period();
      const staleQuota = ledger.quotaPeriod !== undefined && ledger.quotaPeriod !== period();
      if (ledger.lease && ledger.lease.expiresAt > now()) throw new BuildConflict();
      let job = ledger.jobs[city];
      if (job && (job.status === "completed" || ((job.status === "failed" || job.status === "blocked") && !retry))) return publicBuildStatus(job);
      if (job && job.maxCalls !== maxCalls) throw new Error("Existing build call budget cannot be changed");
      job ??= { city, id: randomUUID(), stage: "gather", status: "ready", calls: 0, maxCalls, failures: 0,
        updatedAt: new Date(now()).toISOString(), cache: {}, payload: {} };
      ledger.jobs[city] = job;
      if (job.failures >= 3) return publicBuildStatus(job);
      job.status = "running";
      delete job.error;
      ledger.lease = { owner, expiresAt: now() + 120_000 };
      // Only the winner may execute; the storage implementation must be durable across instances.
      version = await options.repo.write(ledger, version);
      const save = async () => {
        if (ledger.lease?.owner !== owner || ledger.lease.expiresAt <= now()) throw new BuildConflict();
        job.updatedAt = new Date(now()).toISOString();
        version = await options.repo.write(ledger, version);
      };
      let attempts = 0;
      const started = now();
      let interruption: Error | undefined;
      const guardedFetch: typeof globalThis.fetch = async (input, init) => {
        const stop = (error: Error): never => { interruption = error; throw error; };
        if (attempts >= 4 || now() - started >= 35_000) stop(new BuildYield());
        if (job.calls >= job.maxCalls) stop(new BuildBudget("Per-build call limit reached"));
        if (ledger.remaining === null) stop(new BuildBudget("Set WORLD_BUILD_QUOTA_REMAINING before initializing builds"));
        if (staleQuota) stop(new BuildBudget(`A new quota month began; reconcile the remaining Qloo quota for ${period()} first`));
        if (ledger.remaining! <= floor) stop(new BuildBudget("Monthly quota reserve reached"));
        attempts++; job.calls++; ledger.remaining = ledger.remaining! - 1;
        // Persist the debit before dispatch, including failed, timed out and crashed calls.
        try { await save(); } catch (error) { interruption = new BuildConflict(); throw error; }
        const signal = AbortSignal.any([AbortSignal.timeout(10_000), ...(init?.signal ? [init.signal] : [])]);
        const response = await (options.fetch ?? globalThis.fetch)(input, { ...init, signal });
        const value = response.headers.get("X-Month-RateLimit-Remaining");
        const observed = value === null ? NaN : Number(value);
        if (Number.isFinite(observed) && observed >= 0) ledger.remaining = Math.min(ledger.remaining!, observed);
        try { await save(); } catch (error) { interruption = new BuildConflict(); throw error; }
        return response;
      };
      const cache: QlooCache = {
        get: async (key) => job.cache[key],
        set: async (key, value) => { job.cache[key] = value; await save(); },
      };
      try {
        if (job.stage === "publish") {
          job.output = await options.repo.publish(job);
          job.status = "completed";
          // Raw checkpoints are no longer needed after output is committed.
          job.payload = {}; job.cache = {};
        } else {
          job.payload = await options.execute(job.stage, job, { cache, fetch: guardedFetch });
          job.stage = BUILD_STAGES[BUILD_STAGES.indexOf(job.stage) + 1];
          job.status = "ready";
        }
      } catch (error) {
        // Qloo transport wraps fetch errors; preserve our deliberate yield/budget/fence signal.
        const cause = interruption ?? error;
        if (cause instanceof BuildConflict) throw cause;
        if (cause instanceof BuildYield) job.status = "ready";
        else if (cause instanceof BuildBudget) { job.status = "blocked"; job.error = cause.message; }
        else {
          job.status = "failed"; job.failures++;
          // Upstream bodies and environment errors can contain private data; expose only a fixed message.
          job.error = "Stage failed. Check server configuration and explicitly retry (maximum three failures).";
        }
      }
      // Commit before releasing the lease; CAS prevents an expired worker publishing over a successor.
      await save();
      delete ledger.lease;
      version = await options.repo.write(ledger, version);
      return publicBuildStatus(job);
    },
  };
}
