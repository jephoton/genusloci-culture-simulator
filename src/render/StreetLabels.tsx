"use client";

import { useFrame, useThree } from "@react-three/fiber";
import { distanceFade, LABEL_FADE } from "@/render/fade";
import { useEffect, useMemo, useRef, useState } from "react";
import { Vector3 } from "three";
import { CITIES } from "@/geo/cities";
import { METRES_PER_UNIT, type CityLayout, type XZ } from "@/render/layout";
import { makeStreetLabelCandidates, selectStreetLabels, snapStreetLabels, type ProjectedStreetLabel } from "@/render/street-labels";
import { GeoSchema, type World } from "@/world/schema";

/** Real names from a static OSM supplement keep older prebuilt Qloo worlds useful without rebuilding. */
export function StreetLabels({ world, layout }: { world: World; layout: CityLayout }) {
  const { gl } = useThree();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [supplement, setSupplement] = useState<{ city: World["city"]; roads: CityLayout["roads"] } | null>(null);
  const city = Object.values(CITIES).find((city) => Math.abs(city.lat - world.city.lat) < 0.00001 && Math.abs(city.lon - world.city.lon) < 0.00001);

  useEffect(() => {
    if (!city) return;
    const controller = new AbortController();
    fetch(`/geo/${city.slug}-street-names.json`, { signal: controller.signal })
      .then((response) => response.ok ? response.json() : null)
      .then((file) => {
        if (!file || controller.signal.aborted || file.city?.lat !== city.lat || file.city?.lon !== city.lon) return;
        const parsed = GeoSchema.shape.roads.safeParse(file.roads);
        if (!parsed.success) return;
        const roads = parsed.data.map((road) => ({ ...road, points: road.points.map(([x, y]): XZ => [x / METRES_PER_UNIT, -y / METRES_PER_UNIT]) }));
        setSupplement({ city, roads });
      })
      .catch(() => { /* Names already in the world remain available if the supplement is unavailable. */ });
    return () => controller.abort();
  }, [city]);

  const candidates = useMemo(() => {
    const named = makeStreetLabelCandidates(layout.roads);
    if (!supplement || supplement.city.lat !== world.city.lat || supplement.city.lon !== world.city.lon) return named;
    const names = new Set(named.map((label) => label.name));
    const extra = makeStreetLabelCandidates(supplement.roads).filter((label) => !names.has(label.name));
    return [...named, ...snapStreetLabels(extra, layout.roads)];
  }, [layout.roads, supplement, world.city.lat, world.city.lon]);

  useEffect(() => {
    const canvas = document.createElement("canvas");
    canvas.setAttribute("aria-hidden", "true");
    canvas.dataset.streetLabels = "true";
    Object.assign(canvas.style, { position: "absolute", inset: "0", width: "100%", height: "100%", pointerEvents: "none", zIndex: "0" });
    gl.domElement.parentElement?.appendChild(canvas);
    canvasRef.current = canvas;
    return () => { canvasRef.current = null; canvas.remove(); };
  }, [gl]);

  const vectors = useMemo(() => ({ point: new Vector3(), end: new Vector3() }), []);
  const lastDraw = useRef(0);
  useFrame(({ camera, size, clock }) => {
    // Labels follow the camera at 30 fps; the simulation and WebGL keep their own frame rate.
    if (clock.elapsedTime - lastDraw.current < 1 / 30) return;
    lastDraw.current = clock.elapsedTime;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const dpr = Math.min(gl.getPixelRatio(), 2);
    const width = Math.round(size.width * dpr), height = Math.round(size.height * dpr);
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    context.setTransform(dpr, 0, 0, dpr, 0, 0);
    context.clearRect(0, 0, size.width, size.height);
    const citySize = Math.max(layout.bounds.maxX - layout.bounds.minX, layout.bounds.maxZ - layout.bounds.minZ);
    const projected: ProjectedStreetLabel[] = [];
    for (const candidate of candidates) {
      // Street names fade out, then stop drawing, as the camera pulls back.
      const fade = distanceFade(Math.hypot(camera.position.x - candidate.x, camera.position.y, camera.position.z - candidate.z), LABEL_FADE.near * citySize, LABEL_FADE.far * citySize);
      if (fade <= 0) continue;
      const point = vectors.point.set(candidate.x, 0.2, candidate.z).project(camera);
      if (point.z < -1 || point.z > 1) continue;
      const end = vectors.end.set(candidate.x + candidate.dx / 2, 0.2, candidate.z + candidate.dz / 2).project(camera);
      if (end.z < -1 || end.z > 1) continue;
      projected.push({ name: candidate.name, major: candidate.major, x: (point.x + 1) * size.width / 2, y: (1 - point.y) * size.height / 2, dx: (end.x - point.x) * size.width, dy: (point.y - end.y) * size.height, fade });
    }
    const visible = selectStreetLabels(projected, size.width, size.height);
    canvas.dataset.labelCount = String(visible.length);
    context.font = "500 11px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.lineJoin = "round";
    for (const label of visible) {
      context.save();
      context.translate(label.x, label.y);
      context.rotate(label.angle);
      context.globalAlpha = label.opacity * (label.fade ?? 1);
      context.strokeStyle = "#20313c";
      context.lineWidth = 3;
      context.strokeText(label.name, 0, 0);
      context.fillStyle = label.major ? "#c3d0d5" : "#a6b7bf";
      context.fillText(label.name, 0, 0);
      context.restore();
    }
  });
  return null;
}
