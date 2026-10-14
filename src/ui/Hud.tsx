import type { SimDigest } from "@/sim/digest";
import { dayLabel } from "@/ui/words";

function Stat({ label, value, wide = false }: { label: string; value: string | number; wide?: boolean }) {
  return (
    <div className={wide ? "hidden sm:block" : undefined}>
      <p className="text-[11px] uppercase tracking-widest text-zinc-400">{label}</p>
      <p className="font-mono text-sm tabular-nums">{value}</p>
    </div>
  );
}

export type CityOption = { slug: string; name: string };

export function Hud({
  city, digest, tick, ticksPerWeek, cities, citySlug, onCityChange,
}: {
  city: string;
  digest: SimDigest | null;
  tick: number;
  /** Ticks per simulated week (7: daily ticks, so the weekday shows). */
  ticksPerWeek: number;
  cities: CityOption[];
  citySlug: string;
  onCityChange: (slug: string) => void;
}) {
  return (
    <header className="panel pointer-events-none absolute left-2 right-2 top-2 flex flex-wrap items-center gap-x-4 gap-y-1 px-3 py-2 sm:left-4 sm:right-auto sm:top-4 sm:gap-5 sm:px-4">
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
      <Stat label="Date" value={dayLabel(tick, ticksPerWeek)} />
      <Stat wide label="Residents" value={digest?.agents ?? "—"} />
      <Stat wide label="Venues" value={digest ? `${digest.venues.open} open · ${digest.venues.closed} closed` : "—"} />
      <Stat wide label="Events" value={digest?.venues.events ?? "—"} />
      <Stat wide label="Scenes" value={digest?.scenes.length ?? "—"} />
      <Stat label="Fidelity" value={digest ? digest.fidelity.toFixed(2) : "—"} />
    </header>
  );
}
