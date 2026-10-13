import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { fileCache, memoryCache } from "@/qloo/cache";

describe("caches", () => {
  const dirs: string[] = [];
  afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

  it("memory cache round-trips and misses with undefined", async () => {
    const c = memoryCache();
    expect(await c.get("k")).toBeUndefined();
    await c.set("k", { a: [1, 2] });
    expect(await c.get("k")).toEqual({ a: [1, 2] });
  });

  it("file cache persists across instances and creates its directory", async () => {
    const root = mkdtempSync(join(tmpdir(), "qloo-cache-"));
    dirs.push(root);
    const dir = join(root, "nested", "qloo");
    expect(await fileCache(dir).get("k")).toBeUndefined();
    await fileCache(dir).set("k", { n: 3 });
    expect(await fileCache(dir).get("k")).toEqual({ n: 3 });
  });
});
