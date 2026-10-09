import { buildLayout } from "@/render/layout";
import type { World } from "@/world/schema";

// Builds the city layout off the main thread (≈ 0.8 s on London). One request, one response.
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ world: World }>) => void) | null;
  postMessage(message: unknown): void;
};
scope.onmessage = (e) => {
  try {
    scope.postMessage({ ok: true, layout: buildLayout(e.data.world) });
  } catch (err) {
    scope.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) });
  }
};
