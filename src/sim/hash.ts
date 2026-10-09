import type { SimState } from "@/sim/state";

/** FNV-1a over all mutable state (every typed array, scenes and the action log): used to assert determinism. */
export function hashState(s: SimState): string {
  let h = 0x811c9dc5;
  const feedBytes = (bytes: Uint8Array) => {
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
  };
  const feed = (arr: ArrayBufferView) => feedBytes(new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength));

  feed(Int32Array.from([s.tick, s.rngState | 0, s.nVenues]));
  for (const value of Object.values(s)) if (ArrayBuffer.isView(value)) feed(value);
  feed(s.genomes.ids);
  feed(s.genomes.w);
  feed(s.scenes.assignment);
  for (const c of s.scenes.centroids) feed(c);
  feedBytes(new TextEncoder().encode(JSON.stringify([s.scenes.lineages, s.scenes.events, s.scenes.live, s.log])));
  return (h >>> 0).toString(16).padStart(8, "0");
}
