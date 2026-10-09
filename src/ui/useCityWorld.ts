"use client";

import { useEffect, useState } from "react";
import { GeoFileSchema } from "@/geo/geo-file";
import { demoWorld } from "@/ui/demo-world";
import { makeSyntheticCity } from "@/world/fixtures/synthetic-city";
import type { World } from "@/world/schema";

export type CityWorld = { world: World; attribution: string | null; fallback: boolean };

/** Loads real city geometry from public/geo and lays a synthetic population over it; falls back to Synthville. */
export function useCityWorld(slug: string): CityWorld | null {
  const [state, setState] = useState<CityWorld | null>(null);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/geo/${slug}.json`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const file = GeoFileSchema.parse(await res.json());
        if (!cancelled) setState({ world: makeSyntheticCity(file), attribution: file.attribution, fallback: false });
      } catch (e) {
        console.warn(`Couldn't load /geo/${slug}.json; using the synthetic city.`, e);
        if (!cancelled) setState({ world: demoWorld(), attribution: null, fallback: true });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);
  return state;
}
