const METRES_PER_DEG_LAT = 110_540;
const METRES_PER_DEG_LON_AT_EQUATOR = 111_320;

export type LatLon = { lat: number; lon: number };
export type LocalPoint = { x: number; y: number };

/** Equirectangular projection to local metres around `origin` (x east, y north); accurate at city scale. */
export function toLocalMetres(p: LatLon, origin: LatLon): LocalPoint {
  return {
    x: (p.lon - origin.lon) * METRES_PER_DEG_LON_AT_EQUATOR * Math.cos((origin.lat * Math.PI) / 180),
    y: (p.lat - origin.lat) * METRES_PER_DEG_LAT,
  };
}
