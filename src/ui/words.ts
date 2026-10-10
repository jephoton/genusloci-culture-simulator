import type { CityLayout } from "@/render/layout";
import type { VenueKind } from "@/world/schema";

/** The venue kinds a player can open, in picker order, with their plain names. */
export const VENUE_KIND_LABELS: { kind: VenueKind; label: string }[] = [
  { kind: "club", label: "Club" },
  { kind: "bar", label: "Bar" },
  { kind: "cafe", label: "Café" },
  { kind: "restaurant", label: "Restaurant" },
  { kind: "gallery", label: "Gallery" },
  { kind: "music_venue", label: "Music venue" },
  { kind: "shop", label: "Shop" },
  { kind: "stadium", label: "Stadium" },
];

/** Lower-case name of a venue kind, for use mid-sentence ("Opened a music venue"). */
export function kindWord(kind: VenueKind): string {
  return VENUE_KIND_LABELS.find((k) => k.kind === kind)?.label.toLowerCase() ?? "venue";
}

/** Fraction of the city's half-size within which a point counts as "the city centre". */
const CENTRE = 0.3;
const DIRECTIONS = ["east", "south-east", "south", "south-west", "west", "north-west", "north", "north-east"];

/**
 * A rough area name for a scene point: "the city centre", or "the north", "the south-east" and so on,
 * from its direction from the centre (scene x is east, z is south). Neighbourhood names come later.
 */
export function areaName(layout: Pick<CityLayout, "center" | "bounds">, x: number, z: number): string {
  const { center, bounds } = layout;
  const half = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ) / 2;
  const dx = x - center.x;
  const dz = z - center.z;
  if (Math.hypot(dx, dz) < CENTRE * half) return "the city centre";
  const angle = Math.atan2(dz, dx);
  const octant = ((Math.round(angle / (Math.PI / 4)) % 8) + 8) % 8;
  return `the ${DIRECTIONS[octant]}`;
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;

/** The simulated week of `tick`, and its weekday name with daily ticks (Monday = tick 0), else null. */
export function weekAndDay(tick: number, ticksPerWeek: number): { week: number; day: string | null } {
  const perWeek = Math.max(1, ticksPerWeek);
  return { week: Math.floor(tick / perWeek), day: perWeek === 7 ? WEEKDAYS[tick % 7] : null };
}

/** "Week 3 · Fri" with daily ticks, "Week 3" otherwise. */
export function dayLabel(tick: number, ticksPerWeek: number): string {
  const { week, day } = weekAndDay(tick, ticksPerWeek);
  return day ? `Week ${week} · ${day}` : `Week ${week}`;
}
