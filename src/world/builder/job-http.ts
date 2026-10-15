import { createHash, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { CITIES } from "@/geo/cities";
import { BuildConflict } from "./jobs";

const CitySchema = z.string().refine((city) => Object.hasOwn(CITIES, city), "Unsupported city");
const InputSchema = z.object({ city: CitySchema, maxCalls: z.number().int().min(20).max(180).optional(), retry: z.boolean().optional() }).strict();
type Status = { status: string; maxCalls?: number };
type Quota = { remaining: number | null; period: string | null; currentPeriod: string; floor: number };
type Service = {
  status(city: string): Promise<Status | null>;
  advance(city: string, maxCalls: number, retry?: boolean): Promise<Status>;
  quota?(): Promise<Quota>;
  reconcileQuota?(remaining: number, period: string): Promise<{ remaining: number; period: string }>;
};
const QuotaSchema = z.object({ remaining: z.number().int().min(0).max(10_000), period: z.string().regex(/^\d{4}-\d{2}$/) }).strict();

export function createBuildHandlers(token: () => string | undefined, service: () => Service) {
  const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
  const authorize = (request: Request) => {
    const expected = token()?.trim();
    if (!expected) return json({ error: "World builds are disabled: configure WORLD_BUILD_TOKEN" }, 503);
    const supplied = request.headers.get("Authorization") ?? "";
    const hash = (value: string) => createHash("sha256").update(value).digest();
    return timingSafeEqual(hash(supplied), hash(`Bearer ${expected}`)) ? null : json({ error: "Unauthorized" }, 401);
  };
  const failure = (error: unknown) => error instanceof BuildConflict
    ? json({ error: "Another build is advancing. Retry after its lease expires." }, 409)
    : json({ error: "World build storage or configuration is unavailable" }, 503);
  return {
    async GET(request: Request) {
      const denied = authorize(request); if (denied) return denied;
      const city = CitySchema.safeParse(new URL(request.url).searchParams.get("city"));
      if (!city.success) return json({ error: "Unsupported city" }, 400);
      try {
        const builds = service();
        return json({ build: await builds.status(city.data), ...(builds.quota ? { quota: await builds.quota() } : {}) });
      } catch (error) {
        return failure(error);
      }
    },
    async POST(request: Request) {
      const denied = authorize(request); if (denied) return denied;
      let input: z.infer<typeof InputSchema>;
      try {
        const text = await request.text();
        if (text.length > 4096) return json({ error: "Request too large" }, 413);
        const parsed = InputSchema.safeParse(JSON.parse(text));
        if (!parsed.success) return json({ error: "Expected a registry city, maxCalls 20–180, and optional boolean retry" }, 400);
        input = parsed.data;
      } catch { return json({ error: "Invalid JSON" }, 400); }
      try {
        const builds = service();
        const previous = await builds.status(input.city);
        if (previous?.maxCalls !== undefined && input.maxCalls !== undefined && previous.maxCalls !== input.maxCalls) {
          return json({ error: "Existing build call budget cannot be changed" }, 409);
        }
        const build = await builds.advance(input.city, input.maxCalls ?? previous?.maxCalls ?? 180, input.retry);
        return json({ build }, build.status === "completed" ? 200 : build.status === "blocked" ? 409 : build.status === "failed" ? 502 : 202);
      } catch (error) { return failure(error); }
    },
    /** Reconciles the monthly quota estimate: `{ remaining, period: "YYYY-MM" }` for the current UTC month. */
    async PATCH(request: Request) {
      const denied = authorize(request); if (denied) return denied;
      let input: z.infer<typeof QuotaSchema>;
      try {
        const text = await request.text();
        if (text.length > 1024) return json({ error: "Request too large" }, 413);
        const parsed = QuotaSchema.safeParse(JSON.parse(text));
        if (!parsed.success) return json({ error: "Expected { remaining: 0–10000, period: \"YYYY-MM\" }" }, 400);
        input = parsed.data;
      } catch { return json({ error: "Invalid JSON" }, 400); }
      const builds = service();
      if (!builds.reconcileQuota) return json({ error: "Quota reconciliation is unavailable" }, 503);
      try {
        return json({ quota: await builds.reconcileQuota(input.remaining, input.period) });
      } catch (error) {
        if (error instanceof BuildConflict) return failure(error);
        // Validation messages (wrong period, out-of-range figure) are safe to show; storage errors aren't.
        if (error instanceof Error && /period|quota/i.test(error.message)) return json({ error: error.message }, 400);
        return failure(error);
      }
    },
  };
}
