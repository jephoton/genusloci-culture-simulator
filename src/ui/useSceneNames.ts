"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { MAX_SCENES_PER_CALL, type SceneName } from "@/agents/naming";
import type { SimDigest } from "@/sim/digest";
import type { FrameStore } from "@/render/frame-store";
import type { Frame } from "@/sim/frame";
import { SceneNameCache } from "@/ui/timeline-state";

export type SceneToName = { id: number; tastes: string[]; homes: string[]; parentId?: number | null };
const DEBOUNCE_MS = 1500;
const RETRY_MS = 30_000;

export function scenesToName(digest: SimDigest | null, names: ReadonlyMap<number, SceneName>, busyUntil: ReadonlyMap<number, number>, now: number): number[] {
  return (digest?.scenes ?? []).map((s) => s.id).filter((id) => !names.has(id) && (busyUntil.get(id) ?? 0) <= now).slice(0, MAX_SCENES_PER_CALL);
}

/** Preserve names of surviving ancestors; reject naming work from discarded simulation branches. */
export function useSceneNames(city: string, digest: SimDigest | null, describe: (id: number) => SceneToName | null, frame: Frame | null, frames: RefObject<FrameStore>): ReadonlyMap<number, SceneName> {
  const [names, setNames] = useState<ReadonlyMap<number, SceneName>>(new Map());
  const [cache] = useState(() => new SceneNameCache());
  const describeRef = useRef(describe);

  const offline = useRef(false);
  useEffect(() => { describeRef.current = describe;  });
  useEffect(() => () => cache.dispose(), [cache]);
  useEffect(() => {
    if (cache.sync(frame)) {
      // The worker changed branches; publish the cache after discarding future lineages.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNames(new Map(cache.names));
    }
  }, [cache, frame]);
  const epoch = frame?.epoch;
  useEffect(() => {
    if (offline.current) return;
    const current = frames.current.current;
    // A digest from before a rewind must not propose IDs that do not exist on the new branch.
    if (!current || !digest || digest.tick > current.tick) return;
    const ids = scenesToName(digest, cache.names, cache.busy, Date.now()).filter((id) => id < current.lineageParents.length);
    if (ids.length === 0) return;
    const generation = cache.generation;
    const timer = setTimeout(() => {
      if (cache.sync(frames.current.current)) setNames(new Map(cache.names));
      if (generation !== cache.generation) return;
      const scenes = ids.map((id) => describeRef.current(id))
        .filter((s): s is SceneToName => s !== null && s.tastes.length > 0)
        .map(({ parentId, ...s }) => {
          const parent = parentId == null ? undefined : cache.names.get(parentId)?.name;
          return parent ? { ...s, parent } : s;
        });
      if (scenes.length === 0) return;
      for (const scene of scenes) cache.busy.set(scene.id, Date.now() + RETRY_MS);
      void fetch("/api/name-scenes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, scenes, taken: [...cache.names.values()].map((n) => n.name) }),
      }).then(async (res) => {
        if (cache.sync(frames.current.current)) setNames(new Map(cache.names));
        if (generation !== cache.generation) return;
        if (res.status === 503) offline.current = true;
        if (!res.ok) return;
        const { names: got } = (await res.json()) as { names: SceneName[] };
        if (cache.sync(frames.current.current)) setNames(new Map(cache.names));
        if (cache.accept(generation, scenes.map((s) => s.id), got)) setNames(new Map(cache.names));
      }).catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [cache, city, digest, epoch, frames]);
  return names;
}
