import type { CityLayout } from "@/render/layout";

export type StreetLabelCandidate = { name: string; x: number; z: number; dx: number; dz: number; major: boolean };
export type ProjectedStreetLabel = { name: string; x: number; y: number; dx: number; dy: number; major: boolean; /** Distance fade, 0–1 (see render/fade). */ fade?: number };

/** Retain several long segments per street so panning can reveal another readable position. */
export function makeStreetLabelCandidates(roads: CityLayout["roads"]): StreetLabelCandidate[] {
  const candidates: (StreetLabelCandidate & { length: number })[] = [];
  for (const road of roads) {
    if (!road.name?.trim()) continue;
    for (let i = 1; i < road.points.length; i++) {
      const [ax, az] = road.points[i - 1];
      const [bx, bz] = road.points[i];
      const dx = bx - ax, dz = bz - az;
      const length = Math.hypot(dx, dz);
      if (length < 7) continue;
      candidates.push({ name: road.name.trim(), x: (ax + bx) / 2, z: (az + bz) / 2, dx, dz, major: road.kind === "major", length });
    }
  }
  candidates.sort((a, b) => Number(b.major) - Number(a.major) || b.length - a.length);
  const counts = new Map<string, number>();
  return candidates.filter((candidate) => {
    const count = counts.get(candidate.name) ?? 0;
    counts.set(candidate.name, count + 1);
    return count < 5;
  }).slice(0, 600);
}

/** Supplement older worlds without moving their roads: only use nearby, aligned existing segments. */
export function snapStreetLabels(candidates: StreetLabelCandidate[], roads: CityLayout["roads"]): StreetLabelCandidate[] {
  const segments = roads.flatMap((road) => road.points.slice(1).map((b, i) => {
    const a = road.points[i];
    const dx = b[0] - a[0], dz = b[1] - a[1];
    return { a, dx, dz, length: Math.hypot(dx, dz) };
  })).filter((s) => s.length >= 7);
  const result: StreetLabelCandidate[] = [];
  for (const label of candidates) {
    let best = 2; // 20 m maximum discrepancy between OSM snapshots.
    let matched: StreetLabelCandidate | null = null;
    const length = Math.hypot(label.dx, label.dz);
    for (const segment of segments) {
      if (Math.abs((label.dx * segment.dx + label.dz * segment.dz) / (length * segment.length)) < 0.94) continue;
      const t = Math.max(0, Math.min(1, ((label.x - segment.a[0]) * segment.dx + (label.z - segment.a[1]) * segment.dz) / segment.length ** 2));
      const x = segment.a[0] + t * segment.dx, z = segment.a[1] + t * segment.dz;
      const distance = Math.hypot(label.x - x, label.z - z);
      if (distance >= best) continue;
      best = distance;
      matched = { ...label, x: segment.a[0] + segment.dx / 2, z: segment.a[1] + segment.dz / 2, dx: segment.dx, dz: segment.dz };
    }
    if (matched) result.push(matched);
  }
  return result;
}

/** Screen-space decluttering: conservative rotated bounds, edge clearance and one name per street. */
export function selectStreetLabels(candidates: ProjectedStreetLabel[], width: number, height: number) {
  const labels: (ProjectedStreetLabel & { angle: number; opacity: number })[] = [];
  const boxes: { x: number; y: number; w: number; h: number }[] = [];
  const names = new Set<string>();
  for (const label of candidates) {
    if (names.has(label.name)) continue;
    const textWidth = label.name.length * 6.2 + 12;
    const length = Math.hypot(label.dx, label.dy);
    if (length < textWidth * 1.05) continue;
    let angle = Math.atan2(label.dy, label.dx);
    if (angle > Math.PI / 2) angle -= Math.PI;
    if (angle < -Math.PI / 2) angle += Math.PI;
    const w = Math.abs(Math.cos(angle)) * textWidth / 2 + Math.abs(Math.sin(angle)) * 8 + 10;
    const h = Math.abs(Math.sin(angle)) * textWidth / 2 + Math.abs(Math.cos(angle)) * 8 + 10;
    if (label.x - w < 16 || label.y - h < 16 || label.x + w > width - 16 || label.y + h > height - 16) continue;
    if (boxes.some((b) => Math.abs(b.x - label.x) < b.w + w && Math.abs(b.y - label.y) < b.h + h)) continue;
    labels.push({ ...label, angle, opacity: Math.min(1, (length - textWidth) / 35) * (label.major ? 0.8 : 0.58) });
    boxes.push({ x: label.x, y: label.y, w, h });
    names.add(label.name);
    if (labels.length >= 24) break;
  }
  return labels;
}
