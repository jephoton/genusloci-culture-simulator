import type { SimDigest } from "@/sim/digest";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-zinc-400">{label}</p>
      <p className="font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

export function Hud({ city, digest, tick }: { city: string; digest: SimDigest | null; tick: number }) {
  return (
    <header className="panel pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-5 px-4 py-2">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">Genus Loci</p>
        <p className="text-lg font-medium">{city}</p>
      </div>
      <Stat label="Week" value={tick} />
      <Stat label="Residents" value={digest?.agents ?? "—"} />
      <Stat label="Venues" value={digest ? `${digest.venues.open} open · ${digest.venues.closed} closed` : "—"} />
      <Stat label="Events" value={digest?.venues.events ?? "—"} />
      <Stat label="Scenes" value={digest?.scenes.length ?? "—"} />
      <Stat label="Fidelity" value={digest ? digest.fidelity.toFixed(2) : "—"} />
    </header>
  );
}
