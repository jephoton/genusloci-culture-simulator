import type { QlooCache } from "@/qloo/cache";
import { createQlooClient, type QlooClient } from "@/qloo/client";
import { createTransport, QLOO_BASE_URL, QlooError, type Transport } from "@/qloo/transport";

/**
 * Builds the server-side client from environment variables. Never logs the key.
 * - `QLOO_API_KEY` (required)
 * - `QLOO_BASE_URL` (default: the hackathon server)
 * - `QLOO_BUDGET_FLOOR` (default 200): stop network calls when fewer monthly requests remain
 */
export function qlooFromEnv(opts: { cache?: QlooCache; env?: Record<string, string | undefined> } = {}): { client: QlooClient; transport: Transport } {
  const env = opts.env ?? process.env;
  const apiKey = env.QLOO_API_KEY?.trim();
  if (!apiKey) throw new QlooError("QLOO_API_KEY is not set (put it in .env.local; never commit it)");
  const floor = Number(env.QLOO_BUDGET_FLOOR ?? 200);
  const transport = createTransport({
    apiKey,
    baseUrl: env.QLOO_BASE_URL?.trim() || QLOO_BASE_URL,
    cache: opts.cache,
    budgetFloor: Number.isFinite(floor) ? floor : 200,
  });
  return { client: createQlooClient(transport), transport };
}
