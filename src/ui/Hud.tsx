import type { SimDigest } from "@/sim/digest";

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-widest text-zinc-400">{label}</p>
      <p className="font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

export type CityOption = { slug: string; name: string };

export function Hud({
  city, digest, tick, cities, citySlug, onCityChange,
}: {
  city: string;
  digest: SimDigest | null;
  tick: number;
  cities: CityOption[];
  citySlug: string;
  onCityChange: (slug: string) => void;
}) {
  return (
    <header className="panel pointer-events-none absolute left-4 top-4 flex flex-wrap items-center gap-5 px-4 py-2">
      <div>
        <p className="text-[11px] uppercase tracking-[0.3em] text-violet-300">Genus Loci</p>
        {cities.length > 1 ? (
          <select
            aria-label="City"
            value={citySlug}
            onChange={(e) => onCityChange(e.target.value)}
            className="pointer-events-auto -ml-1 rounded-md bg-transparent px-1 text-lg font-medium hover:bg-white/5"
          >
            {cities.map((c) => (
              <option key={c.slug} value={c.slug} className="bg-zinc-900 text-base">
                {c.name}
              </option>
            ))}
          </select>
        ) : (
          <p className="text-lg font-medium">{city}</p>
        )}
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
