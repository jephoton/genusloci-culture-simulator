"use client";

import { useEffect, useState } from "react";
import { GeoFileSchema } from "@/geo/geo-file";
import { buildLayout, type CityLayout } from "@/render/layout";
import { demoWorld } from "@/ui/demo-world";
import { makeSyntheticCity } from "@/world/fixtures/synthetic-city";
import type { World } from "@/world/schema";

export type CityWorld = { slug: string; world: World; layout: CityLayout; attribution: string | null; fallback: boolean };

/** Builds the city layout in a Web Worker, so a big city doesn't freeze the page. */
function layoutInWorker(world: World): Promise<CityLayout> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL("../render/layout.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ ok: boolean; layout?: CityLayout; error?: string }>) => {
      worker.terminate();
      if (e.data.ok && e.data.layout) resolve(e.data.layout);
      else reject(new Error(e.data.error ?? "layout failed"));
    };
    worker.onerror = (e) => {
      worker.terminate();
      reject(new Error(e.message));
    };
    worker.postMessage({ world });
  });
}

/** The layout from the worker, or built on the main thread if the worker fails. */
async function layoutOf(world: World): Promise<CityLayout> {
  try {
    return await layoutInWorker(world);
  } catch (e) {
    console.warn("Couldn't build the layout in a worker; building it on the main thread.", e);
    return buildLayout(world);
  }
}

/**
 * Loads real city geometry from public/geo and lays a synthetic population over it; falls back to Synthville.
 * The layout is built off the main thread.
 */
export function useCityWorld(slug: string): CityWorld | null {
  const [state, setState] = useState<CityWorld | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let loaded: Omit<CityWorld, "layout" | "slug">;
      try {
        const res = await fetch(`/geo/${slug}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const file = GeoFileSchema.parse(await res.json());
        loaded = { world: makeSyntheticCity(file), attribution: file.attribution, fallback: false };
      } catch (e) {
        console.warn(`Couldn't load /geo/${slug}.json; using the synthetic city.`, e);
        loaded = { world: demoWorld(), attribution: null, fallback: true };
      }
      if (cancelled) return;
      const layout = await layoutOf(loaded.world);
      if (!cancelled) setState({ ...loaded, layout, slug });
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return state;
}
