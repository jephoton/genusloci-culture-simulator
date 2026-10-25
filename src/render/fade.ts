/**
 * 1 up to `near`, easing to 0 at `far`: for map details that should fade as the camera pulls away
 * (the fog hides the ground from about 0.3 × the city's size, so overlays shouldn't outlast it).
 */
export function distanceFade(distance: number, near: number, far: number): number {
  if (distance <= near) return 1;
  if (distance >= far) return 0;
  const k = (far - distance) / (far - near);
  return k * k * (3 - 2 * k);
}

/** Camera distances, as fractions of the city's size, over which scene auras and street names fade out. */
export const AURA_FADE = { near: 0.45, far: 0.9 } as const;
export const LABEL_FADE = { near: 0.35, far: 0.55 } as const;
