import { createHash } from "node:crypto";
import { BlobNotFoundError, BlobPreconditionFailedError, get, put } from "@vercel/blob";
import { parseWorld } from "@/world/schema";
import { BuildConflict, type BuildLedger, type BuildRepository } from "./jobs";

export const BUILD_LEDGER_PATH = "world-builds/ledger.json";

/** All data and checkpoints remain in private Blob; never use a process-local lock. */
export function blobBuildRepository(): BuildRepository {
  return {
    async read() {
      try {
        const result = await get(BUILD_LEDGER_PATH, { access: "private", useCache: false });
        if (!result) return { ledger: null, version: null };
        if (result.statusCode !== 200) throw new Error("Cannot read build ledger");
        const ledger = JSON.parse(await new Response(result.stream).text()) as BuildLedger;
        if (ledger.version !== 1 || !ledger.jobs) throw new Error("Unsupported build ledger");
        return { ledger, version: result.blob.etag };
      } catch (error) {
        if (error instanceof BlobNotFoundError) return { ledger: null, version: null };
        throw error;
      }
    },
    async write(ledger, version) {
      try {
        const result = await put(BUILD_LEDGER_PATH, JSON.stringify(ledger), {
          access: "private", addRandomSuffix: false, contentType: "application/json",
          ...(version ? { ifMatch: version } : { allowOverwrite: false }),
        });
        return result.etag;
      } catch (error) {
        if (error instanceof BlobPreconditionFailedError) throw new BuildConflict();
        // Create-if-absent collisions may be reported as generic BlobError by the SDK.
        if (!version) {
          const latest = await this.read();
          if (latest.ledger) throw new BuildConflict();
        }
        throw error;
      }
    },
    async publish(job) {
      const json = JSON.stringify(parseWorld(job.payload.world));
      const digest = createHash("sha256").update(json).digest("hex");
      const path = `world-builds/outputs/${job.city}/${digest}.world.json`;
      // Content-addressed writes are idempotent. Only a successful ledger CAS makes this visible.
      await put(path, json, { access: "private", addRandomSuffix: false, allowOverwrite: true, contentType: "application/json" });
      return path;
    },
  };
}

/** Checks the committed ledger before exposing an on-demand result through the normal world store. */
export async function loadBuiltWorldJson(city: string): Promise<string | null> {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return null;
  const { ledger } = await blobBuildRepository().read();
  const job = ledger?.jobs[city];
  if (job?.status !== "completed" || !job.output) return null;
  const result = await get(job.output, { access: "private" });
  if (!result || result.statusCode !== 200) return null;
  return new Response(result.stream).text();
}
