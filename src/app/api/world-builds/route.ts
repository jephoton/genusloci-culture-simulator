import { createBuildHandlers } from "@/world/builder/job-http";
import { defaultBuildService } from "@/world/builder/job-pipeline";

export const maxDuration = 60;
const handlers = createBuildHandlers(() => process.env.WORLD_BUILD_TOKEN, defaultBuildService);
export const GET = handlers.GET;
export const POST = handlers.POST;
export const PATCH = handlers.PATCH;
