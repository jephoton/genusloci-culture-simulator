import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { CITIES, type CitySlug } from "@/geo/cities";
import { GeoFileSchema } from "@/geo/geo-file";
import { createQlooClient } from "@/qloo/client";
import { createTransport, QlooError } from "@/qloo/transport";
import { DEMO_CONFIG, DEMO_SEED } from "@/ui/demo-config";
import { parseWorld, type World } from "@/world/schema";
import { applySeedHeatmaps, assembleWorld, attachHeatmaps, type HeatmapPlan } from "./assemble";
import { equilibrateCapacities } from "./equilibrate";
import { gatherCity, gatherHeatmaps } from "./gather";
import { blobBuildRepository } from "./job-store";
import { createBuildService, type StageExecutor } from "./jobs";

export const executeBuildStage: StageExecutor = async (stage, job, controls) => {
  const city = CITIES[job.city as CitySlug];
  const key = process.env.QLOO_API_KEY?.trim();
  const client = () => {
    if (!key) throw new QlooError("Qloo configuration missing");
    return createQlooClient(createTransport({ apiKey: key, baseUrl: process.env.QLOO_BASE_URL,
      cache: controls.cache, fetch: controls.fetch, maxRetries: 0, budgetFloor: 1000 }));
  };
  if (stage === "gather") {
    const file = GeoFileSchema.parse(JSON.parse(await readFile(join(process.cwd(), "public", "geo", `${city.slug}.json`), "utf8")));
    const bundle = await gatherCity(client(), city, file.geo);
    bundle.builtAt = job.updatedAt;
    const assembled = assembleWorld(bundle);
    return { world: assembled.world, heatmapPlan: assembled.heatmapPlan };
  }
  if (stage === "heatmaps") {
    const world = parseWorld(job.payload.world);
    const { seeds, checks } = await gatherHeatmaps(client(), world, job.payload.heatmapPlan as HeatmapPlan, city);
    return { world: attachHeatmaps(applySeedHeatmaps(world, seeds), checks) };
  }
  return { world: parseWorld(equilibrateCapacities(job.payload.world as World, DEMO_CONFIG, DEMO_SEED)) };
};

export function defaultBuildService() {
  return createBuildService({
    repo: blobBuildRepository(), execute: executeBuildStage,
    initialQuota: Number(process.env.WORLD_BUILD_QUOTA_REMAINING),
    budgetFloor: Number(process.env.QLOO_BUDGET_FLOOR ?? 1000),
  });
}
