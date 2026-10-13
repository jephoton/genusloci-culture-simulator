import { makeTinyWorld } from "@/world/fixtures/tiny-world";
import type { World } from "@/world/schema";

/** Synthetic demo city, used until real Qloo worlds exist (M4). */
export function demoWorld(): World {
  return makeTinyWorld({ seed: 7, clusters: 6, entitiesPerCluster: 20, gridSize: 10 });
}
