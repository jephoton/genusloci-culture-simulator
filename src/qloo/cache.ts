import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/** Stores trimmed, parsed Qloo results by request key. Server-side only (Qloo terms: never commit or publish). */
export interface QlooCache {
  get(key: string): Promise<unknown | undefined>;
  set(key: string, value: unknown): Promise<void>;
}

export function memoryCache(): QlooCache {
  const m = new Map<string, unknown>();
  return {
    get: async (key) => m.get(key),
    set: async (key, value) => void m.set(key, value),
  };
}

/** One JSON file per key under `dir` (default `.cache/qloo`, which is git-ignored). */
export function fileCache(dir = ".cache/qloo"): QlooCache {
  let ready: Promise<unknown> | undefined;
  return {
    async get(key) {
      try {
        return JSON.parse(await readFile(join(dir, `${key}.json`), "utf8")) as unknown;
      } catch {
        return undefined;
      }
    },
    async set(key, value) {
      ready ??= mkdir(dir, { recursive: true });
      await ready;
      await writeFile(join(dir, `${key}.json`), JSON.stringify(value));
    },
  };
}
