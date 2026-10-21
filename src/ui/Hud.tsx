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
    <header className="panel pointer-events-auto absolute left-2 right-2 top-2 z-20 flex items-center justify-between gap-3 px-3 py-2 sm:left-4 sm:right-auto sm:top-4 sm:min-w-72 sm:gap-5 sm:px-4">
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
      <details className="relative self-center" onKeyDown={(e) => {
        if (e.key === "Escape" && e.currentTarget.open) {
          e.preventDefault();
          e.stopPropagation();
          e.currentTarget.open = false;
          e.currentTarget.querySelector("summary")?.focus();
        }
      }}>
        <summary className="cursor-pointer rounded-md px-2 py-2 text-xs text-zinc-300 hover:bg-white/10">City overview</summary>
        <div className="panel absolute right-0 top-full mt-3 grid w-64 grid-cols-2 gap-4 p-4">
          <Stat label="Date" value={dayLabel(tick, ticksPerWeek)} />
          <Stat label="Residents" value={digest?.agents ?? "—"} />
          <Stat label="Venues" value={digest ? `${digest.venues.open} open · ${digest.venues.closed} closed` : "—"} />
          <Stat label="Events" value={digest?.venues.events ?? "—"} />
          <Stat label="Scenes" value={digest?.scenes.length ?? "—"} />
          <Stat label="Fidelity" value={digest ? digest.fidelity.toFixed(2) : "—"} />
          <p className="col-span-2 text-xs text-zinc-500">Fidelity checks spatial tastes against held-out Qloo data. Simulated outcomes are not business forecasts.</p>
        </div>
      </details>
    </header>
  );
}
