import { QlooError } from "@/qloo/transport";

// Qloo silently ignores invalid values and returns an empty 200, so bad input is rejected here instead.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENTITY_TYPES = [
  "urn:entity:artist",
  "urn:entity:book",
  "urn:entity:brand",
  "urn:entity:destination",
  "urn:entity:movie",
  "urn:entity:person",
  "urn:entity:place",
  "urn:entity:podcast",
  "urn:entity:tv_show",
  "urn:entity:video_game",
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export interface LatLon {
  lat: number;
  lon: number;
}

function fail(msg: string): never {
  throw new QlooError(`Invalid Qloo request: ${msg}`);
}

export function checkEntityIds(ids: readonly string[], what = "entity id"): void {
  for (const id of ids) if (!UUID.test(id)) fail(`${what} "${id}" is not a Qloo entity id (UUID)`);
}

export function checkTags(tags: readonly string[]): void {
  for (const t of tags) if (!/^urn:tag:[a-z0-9_]+(:[a-z0-9_.\-]+)+$/i.test(t)) fail(`tag "${t}" is not a tag URN (urn:tag:…)`);
}

export function checkAudiences(ids: readonly string[]): void {
  for (const a of ids) if (!/^urn:audience:[a-z0-9_]+(:[a-z0-9_.\-]+)*$/i.test(a)) fail(`audience "${a}" is not an audience URN`);
}

export function checkEntityType(type: string): asserts type is EntityType {
  if (!(ENTITY_TYPES as readonly string[]).includes(type)) fail(`unsupported entity type "${type}"`);
}

export function checkTake(take: number): void {
  if (!Number.isInteger(take) || take < 1 || take > 50) fail(`take must be an integer 1–50 (got ${take})`);
}

export function checkOffset(offset: number): void {
  if (!Number.isInteger(offset) || offset < 0) fail(`offset must be a non-negative integer (got ${offset})`);
}

export function checkLocation(at: LatLon, radiusM: number): void {
  if (!(at.lat >= -90 && at.lat <= 90 && at.lon >= -180 && at.lon <= 180)) fail(`location out of range (${at.lat}, ${at.lon})`);
  if (!(radiusM > 0 && radiusM <= 100_000)) fail(`radius must be in (0, 100 km] (got ${radiusM})`);
}

/** WKT point; Qloo wants longitude first. */
export const wktPoint = (at: LatLon): string => `POINT(${at.lon} ${at.lat})`;
