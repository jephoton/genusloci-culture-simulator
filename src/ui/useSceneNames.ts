"use client";

import { useEffect, useRef, useState } from "react";
import { MAX_SCENES_PER_CALL, type SceneName } from "@/agents/naming";
import type { SimDigest } from "@/sim/digest";

export type SceneToName = { id: number; tastes: string[]; homes: string[]; parentId?: number | null };

/** Wait for scenes to settle before naming (new ones often appear in bursts). */
const DEBOUNCE_MS = 1500;
/** After a failure, leave those scenes alone for this long. */
const RETRY_MS = 30_000;

/** The live scenes that have no name yet and aren't being named or cooling down after a failure. */
export function scenesToName(
  digest: SimDigest | null,
  names: ReadonlyMap<number, SceneName>,
  busyUntil: ReadonlyMap<number, number>,
  now: number,
): number[] {
  return (digest?.scenes ?? []).map((s) => s.id).filter((id) => !names.has(id) && (busyUntil.get(id) ?? 0) <= now).slice(0, MAX_SCENES_PER_CALL);
}

/**
 * Names each new scene once, in small batches, via /api/name-scenes; scenes are keyed by lineage id,
 * so a name sticks for the scene's whole life. Without an LLM the map just stays empty.
 */
export function useSceneNames(city: string, digest: SimDigest | null, describe: (id: number) => SceneToName | null): ReadonlyMap<number, SceneName> {
  const [names, setNames] = useState<ReadonlyMap<number, SceneName>>(new Map());
  const busyUntil = useRef(new Map<number, number>());
  const describeRef = useRef(describe);
  const namesRef = useRef(names);
  const offline = useRef(false);
  useEffect(() => {
    describeRef.current = describe;
    namesRef.current = names;
  });

  useEffect(() => {
    if (offline.current) return;
    const ids = scenesToName(digest, namesRef.current, busyUntil.current, Date.now());
    if (ids.length === 0) return;
    const timer = setTimeout(() => {
      const scenes = ids
        .map((id) => describeRef.current(id))
        .filter((s): s is SceneToName => s !== null && s.tastes.length > 0)
        .map(({ parentId, ...s }) => {
          const parent = parentId == null ? undefined : namesRef.current.get(parentId)?.name;
          return parent ? { ...s, parent } : s;
        });
      if (scenes.length === 0) return;
      const until = Date.now() + RETRY_MS;
      for (const s of scenes) busyUntil.current.set(s.id, until);
      const taken = [...namesRef.current.values()].map((n) => n.name);
      void fetch("/api/name-scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, scenes, taken }),
      })
        .then(async (res) => {
          if (res.status === 503) offline.current = true;
          if (!res.ok) return;
          const { names: got } = (await res.json()) as { names: SceneName[] };
          setNames((prev) => {
            const next = new Map(prev);
            for (const n of got) next.set(n.id, n);
            return next;
          });
        })
        .catch(() => {});
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [city, digest]);

  return names;
}
