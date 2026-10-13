import { createHash } from "node:crypto";
import type { QlooCache } from "@/qloo/cache";

export const QLOO_BASE_URL = "https://hackathon.api.qloo.com";

export type ParamValue = string | number | boolean | readonly (string | number)[] | undefined;
export type Params = Record<string, ParamValue>;

export class QlooError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "QlooError";
  }
}

/** The monthly quota is below the configured floor; only cached results are available. */
export class QlooBudgetError extends QlooError {
  constructor(remaining: number, floor: number) {
    super(`Qloo monthly quota is low (${remaining} left, floor ${floor}); refusing network calls`);
    this.name = "QlooBudgetError";
  }
}

export interface TransportOptions {
  apiKey: string;
  baseUrl?: string;
  fetch?: typeof globalThis.fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  cache?: QlooCache;
  /** Refuse network calls once `X-Month-RateLimit-Remaining` drops below this. */
  budgetFloor?: number;
  /** Retries for 429s, 5xx and network errors (each kind counted together). */
  maxRetries?: number;
  /** Request starts allowed per rolling second (server limit is 5). */
  perSecond?: number;
}

export interface TransportStats {
  calls: number;
  cacheHits: number;
  rateLimited: number;
  monthRemaining?: number;
}

export interface Transport {
  /** GET `path` with `params`, parse the JSON with `parse`, and cache the parsed value. */
  get<T>(path: string, params: Params, parse: (json: unknown) => T): Promise<T>;
  stats(): TransportStats;
}

function entries(params: Params): [string, string][] {
  return Object.entries(params)
    .filter((e): e is [string, Exclude<ParamValue, undefined>] => e[1] !== undefined)
    .map(([k, v]): [string, string] => [k, Array.isArray(v) ? v.join(",") : String(v)])
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
}

export function buildUrl(baseUrl: string, path: string, params: Params): string {
  const qs = new URLSearchParams(entries(params)).toString();
  return `${baseUrl}${path}${qs ? `?${qs}` : ""}`;
}

export function cacheKey(path: string, params: Params): string {
  return createHash("sha256").update(JSON.stringify([path, entries(params)])).digest("hex").slice(0, 40);
}

function errorMessage(body: unknown, status: number): string {
  const b = body as { errors?: { message?: string }[]; error_msg?: string; message?: string } | null;
  const msg = b?.errors?.map((e) => e.message).join("; ") || b?.error_msg || b?.message;
  return `Qloo ${status}${msg ? `: ${msg}` : ""}`;
}

export function createTransport(opts: TransportOptions): Transport {
  const baseUrl = opts.baseUrl ?? QLOO_BASE_URL;
  const doFetch = opts.fetch ?? globalThis.fetch;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const maxRetries = opts.maxRetries ?? 5;
  const perSecond = opts.perSecond ?? 4;
  const floor = opts.budgetFloor ?? 0;
  const stats: TransportStats = { calls: 0, cacheHits: 0, rateLimited: 0 };
  const starts: number[] = [];
  let gate: Promise<void> = Promise.resolve();

  /** Serialises request starts so at most `perSecond` begin in any rolling second. */
  function throttle(): Promise<void> {
    const turn = gate.then(async () => {
      while (starts.length >= perSecond) {
        const wait = starts[starts.length - perSecond] + 1000 - now();
        if (wait <= 0) break;
        await sleep(wait);
      }
      starts.push(now());
      if (starts.length > perSecond) starts.splice(0, starts.length - perSecond);
    });
    gate = turn.catch(() => {});
    return turn;
  }

  async function fetchJson(url: string): Promise<unknown> {
    for (let attempt = 0; ; attempt++) {
      if (stats.monthRemaining !== undefined && stats.monthRemaining < floor) {
        throw new QlooBudgetError(stats.monthRemaining, floor);
      }
      await throttle();
      let res: Response;
      try {
        res = await doFetch(url, { headers: { "X-Api-Key": opts.apiKey, Accept: "application/json" } });
      } catch (e) {
        if (attempt >= maxRetries) throw new QlooError(`Qloo network error: ${(e as Error).message}`);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      const remaining = Number(res.headers.get("X-Month-RateLimit-Remaining"));
      if (res.headers.has("X-Month-RateLimit-Remaining") && Number.isFinite(remaining)) stats.monthRemaining = remaining;
      const body: unknown = await res.json().catch(() => null);
      if (res.status === 429) {
        stats.rateLimited++;
        if (attempt >= maxRetries) throw new QlooError(errorMessage(body, 429), 429);
        const reset = Number(res.headers.get("X-Second-RateLimit-Reset"));
        await sleep(Number.isFinite(reset) && reset > 0 ? Math.ceil(reset * 1000) : 1000);
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= maxRetries) throw new QlooError(errorMessage(body, res.status), res.status);
        await sleep(500 * 2 ** attempt);
        continue;
      }
      stats.calls++;
      if (!res.ok) throw new QlooError(errorMessage(body, res.status), res.status);
      return body;
    }
  }

  return {
    async get(path, params, parse) {
      const key = cacheKey(path, params);
      if (opts.cache) {
        const hit = await opts.cache.get(key);
        if (hit !== undefined) {
          stats.cacheHits++;
          return hit as ReturnType<typeof parse>;
        }
      }
      const value = parse(await fetchJson(buildUrl(baseUrl, path, params)));
      if (opts.cache) await opts.cache.set(key, value);
      return value;
    },
    stats: () => ({ ...stats }),
  };
}
