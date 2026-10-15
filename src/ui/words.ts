import { type CityLayout, nearestCell } from "@/render/layout";
import type { VenueKind, World } from "@/world/schema";

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
 * An area name for a scene point: the nearest cell's neighbourhood (from Qloo, in real worlds), else
 * "the city centre" or "the north", "the south-east" and so on, from its direction from the centre
 * (scene x is east, z is south).
 */
export function areaName(
  layout: Pick<CityLayout, "center" | "bounds"> & Partial<Pick<CityLayout, "cellX" | "cellZ">>,
  x: number,
  z: number,
  world?: Pick<World, "cells">,
): string {
  if (world && layout.cellX && layout.cellZ && layout.cellX.length === world.cells.length) {
    const area = world.cells[nearestCell({ cellX: layout.cellX, cellZ: layout.cellZ }, x, z)]?.area;
    if (area) return area;
  }
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

/** "1 night", "3 nights", "1 week", "2 weeks". */
export const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? "" : "s"}`;
