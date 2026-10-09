import type { SimState } from "@/sim/state";

/** FNV-1a over all mutable state: used to assert determinism. */
export function hashState(s: SimState): string {
  let h = 0x811c9dc5;
  const feed = (arr: ArrayBufferView) => {
    const bytes = new Uint8Array(arr.buffer, arr.byteOffset, arr.byteLength);
    for (let i = 0; i < bytes.length; i++) {
      h ^= bytes[i];
      h = Math.imul(h, 0x01000193);
    }
  };
  feed(Int32Array.from([s.tick, s.rngState | 0]));
  feed(s.genomes.ids);
  feed(s.genomes.w);
  feed(s.attendance);
  feed(s.venueOpen);
  feed(s.venueHealth);
  feed(s.venueLowTicks);
  return (h >>> 0).toString(16).padStart(8, "0");
}
